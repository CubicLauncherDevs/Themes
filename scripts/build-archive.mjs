#!/usr/bin/env node
// scripts/build-archive.mjs
// Reconstruye todo el repositorio de temas (src/ + metadatos) descargando los
// assets binarios desde R2 y los textos desde GitHub raw, y lo empaqueta en
// un ZIP listo para publicar como release.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, createWriteStream, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { get as httpsGet } from "node:https";
import { get as httpGet } from "node:http";
import { execSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const THEMES_JSON = join(ROOT, "themes.json");

const BINARY_RE = /\.(png|jpg|jpeg|webp|gif|svg|mp4|webm|zip|ttf|woff|woff2|otf|eot)$/i;
const MAX_ZIP_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB límite de GitHub
const CONCURRENCY = 10;

const DRY_RUN = process.argv.includes("--dry-run");

function isBinary(name) {
  return BINARY_RE.test(name);
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true });
    const file = createWriteStream(dest);
    const getter = url.startsWith("https:") ? httpsGet : httpGet;

    const req = getter(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { rmSync(dest, { force: true }); } catch {}
        return downloadFile(new URL(res.headers.location, url).toString(), dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { rmSync(dest, { force: true }); } catch {}
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
      file.on("error", (e) => {
        try { rmSync(dest, { force: true }); } catch {}
        reject(e);
      });
    });

    req.on("error", (e) => {
      file.close();
      try { rmSync(dest, { force: true }); } catch {}
      reject(e);
    });
  });
}

async function runPool(tasks, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const idx = index++;
      try {
        results[idx] = { ok: await tasks[idx]() };
      } catch (e) {
        results[idx] = { error: e };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function copyLocalDir(src, dest) {
  // cp -r funciona en el runner de Ubuntu y evita traernos una librería de ZIP.
  execSync(`cp -r "${src}" "${dest}"`, { stdio: "ignore" });
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log2(bytes) / 10);
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

async function main() {
  const timestamp = nowStamp();
  const baseName = `CubicLauncher-Themes-Archive-${timestamp}`;
  const stagingRoot = join(ROOT, "release", baseName);
  const zipPath = join(ROOT, `${baseName}.zip`);
  const releaseDir = join(ROOT, "release");

  // Limpiar staging anterior si existe
  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });

  console.log(`\n📦 Building archive: ${baseName}\n`);

  // 1. Copiar src/ local (archivos de texto que están en Git). Esto también
  //    conserva archivos como theme.md que no aparecen en themes.json.
  try {
    copyLocalDir(join(ROOT, "src"), join(stagingRoot, "src"));
    console.log("✓ Copied local src/");
  } catch (e) {
    console.error("✗ Failed to copy src/:", e.message);
    process.exit(1);
  }

  // 2. Copiar metadatos
  for (const f of ["themes.json", "packages.json", "README.md", "LICENSE"]) {
    const fp = join(ROOT, f);
    if (existsSync(fp)) {
      copyFileSync(fp, join(stagingRoot, f));
    }
  }
  console.log("✓ Copied metadata files");

  // 3. Themes.json
  if (!existsSync(THEMES_JSON)) {
    console.error("✗ themes.json not found");
    process.exit(1);
  }
  const themes = JSON.parse(readFileSync(THEMES_JSON, "utf8"));
  let versionCount = 0;
  const fileTasks = [];
  let skipped = 0;
  let missing = 0;

  for (const theme of themes) {
    for (const ver of theme.versions || []) {
      versionCount++;
      const versionDir = ver.dirPath; // e.g. src/4xnl/Colorful/V1
      for (const file of ver.files || []) {
        const absDest = join(stagingRoot, versionDir, file.name);
        if (existsSync(absDest)) {
          skipped++;
          continue;
        }

        missing++;
        if (DRY_RUN) continue;

        fileTasks.push(async () => {
          await downloadFile(file.url, absDest);
          return file.url;
        });
      }
    }
  }

  console.log(`Themes: ${themes.length} | Versions: ${versionCount}`);
  console.log(`Files already present (text): ${skipped}`);
  console.log(`Files to download: ${missing}`);

  if (DRY_RUN) {
    console.log("\n🏃 Dry run complete. Re-run without --dry-run to download and package.");
    return;
  }

  if (fileTasks.length > 0) {
    console.log(`\n⬇ Downloading ${fileTasks.length} files with ${CONCURRENCY} concurrent workers...`);
    const results = await runPool(fileTasks, CONCURRENCY);
    const errors = results.filter((r) => r.error);
    console.log(`✓ Downloaded ${results.length - errors.length} files`);
    if (errors.length > 0) {
      console.error(`\n✗ ${errors.length} download(s) failed:`);
      for (const e of errors.slice(0, 10)) {
        console.error("  -", e.error.message);
      }
      if (errors.length > 10) console.error(`  ...and ${errors.length - 10} more`);
      process.exit(1);
    }
  }

  // 4. Comprimir
  console.log("\n🗜 Creating ZIP...");
  mkdirSync(dirname(zipPath), { recursive: true });
  try {
    execSync(`zip -r "${zipPath}" "${baseName}"`, { cwd: releaseDir, stdio: "inherit" });
  } catch (e) {
    console.error("✗ Failed to create ZIP:", e.message);
    process.exit(1);
  }

  const size = statSync(zipPath).size;
  console.log(`\n📁 ${zipPath}`);
  console.log(`   Size: ${formatBytes(size)}`);

  if (size > MAX_ZIP_SIZE) {
    console.error(`\n✗ ZIP exceeds GitHub release asset limit of 2 GB (${formatBytes(size)}). Cancelling release.`);
    process.exit(1);
  }

  // 5. Generar notas y variables para el workflow
  const tagName = `archive-${timestamp}`;
  const title = `Themes Archive — ${timestamp.replace(/-(\d{2})(\d{2})$/, " $1:$2 UTC")}`;
  const sizeMB = (size / 1024 / 1024).toFixed(2);

  const body = `# Themes Archive — ${timestamp}\n\n` +
    `- **Themes:** ${themes.length}\n` +
    `- **Versions:** ${versionCount}\n` +
    `- **Assets downloaded:** ${fileTasks.length}\n` +
    `- **ZIP size:** ${sizeMB} MB\n\n` +
    `Este paquete contiene todos los temas (todas las versiones) con sus ` +
    `archivos de texto desde GitHub y sus assets binarios desde R2.`;

  writeFileSync(join(ROOT, "release-notes.md"), body);
  writeFileSync(
    join(ROOT, ".archive-info.env"),
    `ZIP_PATH="${zipPath}"\n` +
    `TAG_NAME="${tagName}"\n` +
    `RELEASE_TITLE="${title}"\n` +
    `ZIP_SIZE_BYTES=${size}\n` +
    `ZIP_SIZE_MB="${sizeMB}"\n`
  );

  console.log(`\n✅ Archive ready for release:`);
  console.log(`   Tag:   ${tagName}`);
  console.log(`   Title: ${title}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
