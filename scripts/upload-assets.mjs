#!/usr/bin/env node

import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, createWriteStream, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";
import { get } from "node:https";

// ---- ENV ----

let { R2_S3_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE, PREVIEW_DIRS } = process.env;
if (!R2_S3_URL || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_BASE) {
  console.error("Missing env vars: R2_S3_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE");
  process.exit(1);
}
if (!R2_PUBLIC_BASE.startsWith("http")) R2_PUBLIC_BASE = `https://${R2_PUBLIC_BASE}`;
R2_PUBLIC_BASE = R2_PUBLIC_BASE.replace(/\/+$/, "");

// ---- S3 client ----

const r2Url = new URL(R2_S3_URL);
const r2Endpoint = `${r2Url.protocol}//${r2Url.host}`;
const r2Bucket = r2Url.pathname.replace(/^\//, "").replace(/\/$/, "");
const s3 = new S3Client({
  endpoint: r2Endpoint, region: "auto", forcePathStyle: true,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// ---- Constants ----

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const THEMES_JSON = join(ROOT, "themes.json");
const GH_BASE = "https://raw.githubusercontent.com/santiagolxx/asdasd/refs/heads/master";
const BINARY_RE = /\.(png|jpg|jpeg|webp|gif|svg|mp4|webm|zip|ttf|woff|woff2|otf|eot)$/i;
const TEXT_RE = /\.(toml|css|md|txt)$/i;
const SKIP_BINARIES = new Set(["preview.png", "Showcase.png"]);
const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

const targetDirs = process.argv.slice(2).filter(a => a && !a.startsWith("--"));
const targetSet = targetDirs.length ? new Set(targetDirs.map(d => d.replace(/\/+$/, ""))) : null;
const previewDirs = (PREVIEW_DIRS || "").split(/\s+/).filter(Boolean);
const previewSet = previewDirs.length ? new Set(previewDirs.map(d => d.replace(/\/+$/, ""))) : null;

// ---- Helpers ----

function hashFile(fp) {
  const h = createHash("sha256");
  h.update(readFileSync(fp));
  return h.digest("hex").slice(0, 8);
}

function mimeType(fp) {
  const ext = fp.split(".").pop().toLowerCase();
  const map = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
    mp4: "video/mp4", webm: "video/webm", zip: "application/zip",
    ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2", otf: "font/otf", eot: "font/eot",
  };
  return map[ext] || "application/octet-stream";
}

function isBinary(name) { return BINARY_RE.test(name); }
function isText(name) { return TEXT_RE.test(name); }

function naturalSort(a, b) {
  const re = /(\d+)|(\D+)/g;
  const aParts = a.match(re) || [];
  const bParts = b.match(re) || [];
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ap = aParts[i] || "";
    const bp = bParts[i] || "";
    const aNum = parseInt(ap, 10);
    const bNum = parseInt(bp, 10);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      const cmp = ap.localeCompare(bp);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close(); unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close(); unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", (e) => { file.close(); try { unlinkSync(dest); } catch {} reject(e); });
  });
}

function parseToml(text) {
  const result = {}; let sec = result;
  for (const line of text.split("\n")) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const m = t.match(/^\[(.+)\]$/);
    if (m) { result[m[1]] = result[m[1]] || {}; sec = result[m[1]]; continue; }
    const eq = t.indexOf("="); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); let v = t.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    sec[k] = v;
  }
  return result;
}

function parseTomlArray(str) {
  const inner = str.replace(/^\[|\]$/g, "").trim();
  if (!inner) return [];
  const items = [];
  let current = "";
  let inQuote = false;
  for (const ch of inner) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { items.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function fileMtime(fp) {
  try { return execSync(`git log -1 --format="%aI" -- "${relative(ROOT, fp)}"`, { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}

function getR2DirFiles(versionDir) {
  return s3.send(new ListObjectsV2Command({
    Bucket: r2Bucket, Prefix: `${versionDir}/`, MaxKeys: 200,
  })).then(r => r.Contents || []);
}

async function deduplicateR2Files(versionDir) {
  const all = await getR2DirFiles(versionDir);
  const groups = {};
  for (const f of all) {
    const name = f.Key.replace(versionDir + "/", "");
    const cleanName = name.replace(/\.[a-f0-9]{8}(?=\.[^.]+$)/, "");
    if (!groups[cleanName]) groups[cleanName] = [];
    groups[cleanName].push(f);
  }
  const toDelete = [];
  for (const [cleanName, files] of Object.entries(groups)) {
    if (files.length < 2) continue;
    files.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
    for (const old of files.slice(1)) toDelete.push({ Key: old.Key });
  }
  if (toDelete.length) {
    await s3.send(new DeleteObjectsCommand({ Bucket: r2Bucket, Delete: { Objects: toDelete } }));
    for (const d of toDelete) console.log(`  ✗ R2 dedup: ${d.Key}`);
  }
}

async function findAndDownloadBg(versionDir, vDir) {
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: r2Bucket, Prefix: `${versionDir}/bg.`, MaxKeys: 5,
  }));
  const match = list.Contents?.[0];
  if (!match) return null;
  const ext = match.Key.split(".").pop();
  const dest = join(vDir, `bg_r2_temp.${ext}`);
  const url = `${R2_PUBLIC_BASE}/${match.Key}`;
  try { await download(url, dest); return dest; } catch { return null; }
}

async function cleanupOldObjects(r2Key) {
  const prefix = r2Key.substring(0, r2Key.lastIndexOf(".") + 1);
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: r2Bucket, Prefix: prefix, MaxKeys: 20,
  }));
  if (!list.Contents) return;
  const toDelete = list.Contents.filter(o => o.Key !== r2Key);
  if (!toDelete.length) return;
  await s3.send(new DeleteObjectsCommand({ Bucket: r2Bucket, Delete: { Objects: toDelete.map(o => ({ Key: o.Key })) } }));
  for (const o of toDelete) console.log(`  ✗ R2 cleanup: ${o.Key}`);
}

async function pushR2(abs, r2Key, mime, existingFiles) {
  const st = statSync(abs);
  if (st.size > MAX_UPLOAD_SIZE) {
    console.log(`  ⚠ skipped ${r2Key} (${(st.size / 1024 / 1024).toFixed(1)}MB > 25MB)`);
    return { publicUrl: null, r2Key: null, skipped: true };
  }
  const ext = r2Key.split(".").pop();
  const hash = hashFile(abs);
  const base = r2Key.slice(0, -ext.length - 1);
  const hashedKey = `${base}.${hash}.${ext}`;
  const publicUrl = `${R2_PUBLIC_BASE}/${hashedKey}`;

  const existing = existingFiles?.find(f => f.Key === hashedKey || f.Key === r2Key);
  if (existing) return { publicUrl, r2Key: hashedKey, skipped: true };

  try {
    await s3.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: hashedKey }));
    return { publicUrl, r2Key: hashedKey, skipped: true };
  } catch {}

  const body = readFileSync(abs);
  await s3.send(new PutObjectCommand({
    Bucket: r2Bucket, Key: hashedKey, Body: body,
    ContentType: mime, CacheControl: "public, max-age=31536000, immutable",
  }));
  console.log(`  ↑ ${hashedKey}`);
  await cleanupOldObjects(hashedKey);
  return { publicUrl, r2Key: hashedKey, skipped: false };
}

// ---- Main ----

let uploaded = 0, skipped = 0, deletedLocally = 0;
const tempFiles = [];

// Phase 1: Download bg from R2 for preview dirs

if (previewSet) {
  for (const vDirPath of previewSet) {
    const vDir = join(ROOT, vDirPath);
    if (!existsSync(join(vDir, "Meta.toml")) || !existsSync(join(vDir, "Definition.toml"))) continue;
    const hasBg = ["bg.png", "bg.jpg", "bg.jpeg", "bg.gif", "bg.webp"].some(n => existsSync(join(vDir, n)));
    if (hasBg) continue;
    console.log(`  ↓ downloading bg from R2 for ${vDirPath}`);
    const bg = await findAndDownloadBg(vDirPath, vDir);
    if (bg) tempFiles.push(bg);
  }
}

// Phase 2: Generate previews for preview dirs

if (previewSet && previewSet.size > 0) {
  const args = [...previewSet].join(" ");
  console.log(`\n  Generating previews for: ${args}`);
  execSync(`node generate.js --dirs ${args}`, { cwd: ROOT, stdio: "inherit" });
}

// Phase 3: Scan src/ and build themes from scratch

console.log("\n  Scanning themes...");
const themes = [];

if (!existsSync(SRC)) {
  console.error("src/ not found");
  process.exit(1);
}

const authorDirs = readdirSync(SRC, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith("."));

for (const authorDir of authorDirs) {
  const author = authorDir.name;
  const authorPath = join(SRC, author);
  const themeDirs = readdirSync(authorPath, { withFileTypes: true }).filter(d => d.isDirectory());

  for (const themeDir of themeDirs) {
    const name = themeDir.name;
    const themePath = join(authorPath, name);
    const slug = `${author}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const themeMd = (() => {
      try { return readFileSync(join(themePath, "theme.md"), "utf-8"); } catch { return null; }
    })();

    const versionDirs = readdirSync(themePath, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith("."));

    const versions = [];
    let mergedTags = [];
    let metaAuthor = author;
    let metaName = name;
    let metaDescription = null;

    for (const vDir of versionDirs) {
      const versionName = vDir.name;
      const vPath = join(themePath, versionName);
      const relativeDir = relative(ROOT, vPath);

      if (!existsSync(join(vPath, "Meta.toml")) || !existsSync(join(vPath, "Definition.toml"))) continue;

      // Read Meta.toml
      const metaRaw = readFileSync(join(vPath, "Meta.toml"), "utf-8");
      const meta = parseToml(metaRaw);

      let tags = [];
      if (meta.tags && typeof meta.tags === "string" && meta.tags.startsWith("[")) {
        tags = parseTomlArray(meta.tags);
      }
      if (meta.author) metaAuthor = meta.author;
      if (meta.name) metaName = meta.name;
      if (meta.description) metaDescription = meta.description;
      mergedTags = [...new Set([...mergedTags, ...tags])];

      // Read changelog
      let changelog = null;
      try {
        const clFile = readdirSync(vPath).find(f => f.toLowerCase() === "changelog.md");
        if (clFile) changelog = readFileSync(join(vPath, clFile), "utf-8");
      } catch {}

      const injectsCss = existsSync(join(vPath, "Inject.css"));

      // Colle ct files from R2 + disk
      await deduplicateR2Files(relativeDir);
      const r2DirFiles = await getR2DirFiles(relativeDir);
      const r2ByCleanName = {};
      for (const f of r2DirFiles) {
        const rName = f.Key.replace(relativeDir + "/", "");
        const cleanName = rName.replace(/\.[a-f0-9]{8}(?=\.[^.]+$)/, "");
        if (!r2ByCleanName[cleanName]) r2ByCleanName[cleanName] = f;
      }

      const isTarget = !targetSet || targetSet.has(relativeDir);
      const newFiles = [];
      const processed = new Set();

      // Scan disk files (sync)
      const diskEntries = [];
      function scanDisk(dir, base) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".") && !entry.name.startsWith("bg_r2_temp")) continue;
          const rel = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory()) scanDisk(join(dir, entry.name), rel);
          else diskEntries.push({ rel, abs: join(dir, entry.name) });
        }
      }
      if (existsSync(vPath)) scanDisk(vPath, "");

      // Process disk entries (async)
      for (const { rel, abs } of diskEntries) {
        processed.add(rel);
        if (isText(rel)) {
          newFiles.push({ name: rel, url: `${GH_BASE}/${relativeDir}/${rel}` });
        } else if (isBinary(rel) && isTarget) {
          const r2Old = r2ByCleanName[rel];
          if (r2Old) {
            await s3.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: r2Old.Key }));
            console.log(`  ✗ R2 remove old: ${r2Old.Key}`);
          }
          const result = await pushR2(abs, `${relativeDir}/${rel}`, mimeType(rel), r2DirFiles);
          if (result.skipped) skipped++; else uploaded++;
          if (result.publicUrl) {
            newFiles.push({ name: rel, url: result.publicUrl });
            if (!rel.startsWith("bg_r2_temp")) {
              unlinkSync(abs); deletedLocally++;
              console.log(`  ✗ deleted ${rel}`);
            }
          }
        } else if (isBinary(rel)) {
          // Non-target: use R2 URL if exists, otherwise skip
          const r2Match = r2ByCleanName[rel];
          if (r2Match) {
            newFiles.push({ name: rel, url: `${R2_PUBLIC_BASE}/${r2Match.Key}` });
          }
        }
      }

      // Preserve R2-only binary files (not on disk)
      for (const [cleanName, r2Obj] of Object.entries(r2ByCleanName)) {
        if (processed.has(cleanName)) continue;
        newFiles.push({ name: cleanName, url: `${R2_PUBLIC_BASE}/${r2Obj.Key}` });
        processed.add(cleanName);
        console.log(`  ✓ kept from R2: ${r2Obj.Key}`);
      }

      // Get date
      let date = meta.date || null;
      if (!date) {
        const anyFile = readdirSync(vPath).find(f => !f.startsWith(".") && f !== "Showcase.png" && f !== "preview.png");
        if (anyFile) date = fileMtime(join(vPath, anyFile));
      }

      // Determine previewUrl and showcaseUrl
      const previewEntry = newFiles.find(f => f.name === "preview.png");
      const showcaseEntry = newFiles.find(f => f.name === "Showcase.png");

      versions.push({
        version: versionName,
        previewUrl: previewEntry?.url || null,
        showcaseUrl: showcaseEntry?.url || null,
        dirPath: relativeDir,
        date,
        changelog,
        files: newFiles,
        injectsCss,
      });
    }

    if (versions.length === 0) continue;

    versions.sort((a, b) => -naturalSort(a.version, b.version));
    const latest = versions[0];

    themes.push({
      id: slug, slug,
      name: metaName,
      author: metaAuthor,
      tags: mergedTags,
      dirPath: relative(ROOT, themePath),
      description: themeMd || metaDescription || null,
      versions,
      latestVersion: latest.version,
      previewUrl: latest.previewUrl,
      date: latest.date,
    });
  }
}

// Phase 4: Sync top-level previewUrl for each theme

for (const theme of themes) {
  const latest = theme.versions?.[0];
  if (latest?.previewUrl) theme.previewUrl = latest.previewUrl;
}

// Phase 5: Write themes.json

writeFileSync(THEMES_JSON, JSON.stringify(themes, null, 2) + "\n");

// Phase 6: Cleanup temp files

for (const tf of tempFiles) {
  try { unlinkSync(tf); } catch {}
}

console.log(`\n✓ themes.json generated with ${themes.length} themes`);
console.log(`  Uploaded: ${uploaded}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Deleted locally: ${deletedLocally}`);
