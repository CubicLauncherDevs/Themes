#!/usr/bin/env node

import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, mkdirSync, createWriteStream } from "node:fs";
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

// ---- Helpers ----

const BINARY_RE = /\.(png|jpg|jpeg|webp|gif|svg|mp4|webm|zip|ttf|woff|woff2|otf|eot)$/i;
const TEXT_RE = /\.(toml|css|md|txt)$/i;

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

const GH_BASE = "https://raw.githubusercontent.com/santiagolxx/asdasd/refs/heads/master";

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

async function findAndDownloadBg(s3, versionDir, vDir) {
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

async function cleanupOldObjects(s3, r2Key) {
  const prefix = r2Key.substring(0, r2Key.lastIndexOf(".") + 1);
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: r2Bucket, Prefix: prefix, MaxKeys: 20,
  }));
  if (!list.Contents) return;
  const toDelete = list.Contents.filter(o => o.Key !== r2Key);
  if (!toDelete.length) return;
  await s3.send(new DeleteObjectCommand({
    Bucket: r2Bucket, Key: toDelete[0].Key,
  }));
  console.log(`  ✗ R2 cleanup: ${toDelete[0].Key}`);
}

async function pushR2(abs, r2Key, mime, existingFiles) {
  const hash = hashFile(abs);
  const ext = r2Key.split(".").pop();
  const base = r2Key.slice(0, -ext.length - 1);
  const hashedKey = `${base}.${hash}.${ext}`;
  const publicUrl = `${R2_PUBLIC_BASE}/${hashedKey}`;

  // Already on R2 with same content?
  const existing = existingFiles?.find(f => f.Key === hashedKey || f.Key === r2Key);
  if (existing) return { publicUrl, r2Key: hashedKey, skipped: true };

  try {
    await s3.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: hashedKey }));
    return { publicUrl, r2Key: hashedKey, skipped: true };
  } catch { /* upload */ }

  const body = readFileSync(abs);
  await s3.send(new PutObjectCommand({
    Bucket: r2Bucket, Key: hashedKey, Body: body,
    ContentType: mime, CacheControl: "public, max-age=31536000, immutable",
  }));
  console.log(`  ↑ ${hashedKey}`);

  // Cleanup old objects with same prefix
  await cleanupOldObjects(s3, hashedKey);

  return { publicUrl, r2Key: hashedKey, skipped: false };
}

function getR2DirFiles(versionDir) {
  // Returns a promise that resolves to the list of R2 objects for this dir
  return s3.send(new ListObjectsV2Command({
    Bucket: r2Bucket, Prefix: `${versionDir}/`, MaxKeys: 100,
  })).then(r => r.Contents || []);
}

// ---- Main ----

const ROOT = new URL("..", import.meta.url).pathname;
const THEMES_JSON = join(ROOT, "themes.json");

const targetDirs = process.argv.slice(2).filter(a => a && !a.startsWith("--"));
const targetSet = targetDirs.length ? new Set(targetDirs.map(d => d.replace(/\/+$/, ""))) : null;
const previewDirs = (PREVIEW_DIRS || "").split(/\s+/).filter(Boolean);
const previewSet = previewDirs.length ? new Set(previewDirs.map(d => d.replace(/\/+$/, ""))) : null;

if (!existsSync(THEMES_JSON)) {
  console.error("themes.json not found");
  process.exit(1);
}

const themes = JSON.parse(readFileSync(THEMES_JSON, "utf-8"));

let uploaded = 0, skipped = 0, deleted = 0, cleaned = 0;

// ─── Phase 1: Download bg from R2 for preview dirs ───

const tempFiles = [];
if (previewSet) {
  for (const vDirPath of previewSet) {
    const vDir = join(ROOT, vDirPath);
    if (!existsSync(join(vDir, "Meta.toml")) || !existsSync(join(vDir, "Definition.toml"))) continue;
    const hasBg = ["bg.png", "bg.jpg", "bg.jpeg", "bg.gif", "bg.webp"].some(n => existsSync(join(vDir, n)));
    if (hasBg) continue;
    console.log(`  ↓ downloading bg from R2 for ${vDirPath}`);
    const bg = await findAndDownloadBg(s3, vDirPath, vDir);
    if (bg) tempFiles.push(bg);
  }
}

// ─── Phase 2: Generate previews for preview dirs ───

if (previewSet && previewSet.size > 0) {
  const args = [...previewSet].join(" ");
  console.log(`\n  Generating previews for: ${args}`);
  execSync(`node generate.js --dirs ${args}`, { cwd: ROOT, stdio: "inherit" });
}

// ─── Phase 3: Process each version ───

for (const theme of themes) {
  for (const version of theme.versions) {
    if (targetSet && !targetSet.has(version.dirPath)) continue;
    const vDir = join(ROOT, version.dirPath);

    const diskFiles = [];
    if (existsSync(vDir)) {
      function scan(dir, base) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".") && !entry.name.startsWith("bg_r2_temp")) continue;
          const rel = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory()) scan(join(dir, entry.name), rel);
          else diskFiles.push({ rel, abs: join(dir, entry.name) });
        }
      }
      scan(vDir, "");
    }

    const newFiles = [];
    const processed = new Set();

    // Fetch existing R2 files for this dir (for skip detection + cleanup)
    const r2DirFiles = await getR2DirFiles(version.dirPath);

    for (const { rel, abs } of diskFiles) {
      if (rel.startsWith("bg_r2_temp")) {
        // Temp bg files — skip, will be cleaned up
        continue;
      }
      processed.add(rel);
      if (isText(rel)) {
        newFiles.push({ name: rel, url: `${GH_BASE}/${version.dirPath}/${rel}` });
      } else if (isBinary(rel)) {
        const result = await pushR2(abs, `${version.dirPath}/${rel}`, mimeType(rel), r2DirFiles);
        if (result.skipped) skipped++; else uploaded++;
        newFiles.push({ name: rel, url: result.publicUrl });
        unlinkSync(abs); deleted++;
        console.log(`  ✗ deleted ${rel}`);
      }
    }

    // Preserve existing entries for files NOT on disk (previously uploaded)
    if (Array.isArray(version.files)) {
      for (const existing of version.files) {
        const name = typeof existing === "string" ? existing : existing.name;
        if (!processed.has(name)) {
          if (typeof existing === "object" && (existing.url?.includes(R2_PUBLIC_BASE) || existing.url?.includes("themes.cubiclauncher.org"))) {
            newFiles.push(existing);
          }
        }
      }
    }

    version.files = newFiles;

    // Update previewUrl & showcaseUrl  
    const hasPreview = newFiles.find(f => f.name === "preview.png");
    if (hasPreview) version.previewUrl = hasPreview.url;
    const hasShowcase = newFiles.find(f => f.name === "Showcase.png");
    if (hasShowcase) version.showcaseUrl = hasShowcase.url;
  }
}

// ─── Phase 4: Discover NEW themes/versions ───

const existingDirs = new Set();
for (const t of themes) for (const v of t.versions) existingDirs.add(v.dirPath);

function generateSlug(author, name) {
  return `${author}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fileMtime(fp) {
  try { return execSync(`git log -1 --format="%aI" -- "${relative(ROOT, fp)}"`, { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim(); }
  catch { return null; }
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

const SRC = join(ROOT, "src");
if (existsSync(SRC)) {
  for (const author of readdirSync(SRC, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith("."))) {
    const authorPath = join(SRC, author.name);
    for (const theme of readdirSync(authorPath, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const themePath = join(authorPath, theme.name);
      for (const ver of readdirSync(themePath, { withFileTypes: true }).filter(d => d.isDirectory())) {
        const vPath = join(themePath, ver.name);
        const vDir = relative(ROOT, vPath);
        if (existingDirs.has(vDir)) continue;

        const hasMeta = existsSync(join(vPath, "Meta.toml"));
        const hasDef = existsSync(join(vPath, "Definition.toml"));
        if (!hasMeta || !hasDef) continue;

        console.log(`\n  NEW: ${vDir}`);

        const diskFiles = [];
        function scan(dir, base) {
          for (const e of readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith(".")) continue;
            const r = base ? `${base}/${e.name}` : e.name;
            if (e.isDirectory()) scan(join(dir, e.name), r);
            else diskFiles.push({ rel: r, abs: join(dir, e.name) });
          }
        }
        scan(vPath, "");

        const r2DirFiles = await getR2DirFiles(vDir);
        const newFiles = [];
        for (const { rel, abs } of diskFiles) {
          if (isText(rel)) {
            newFiles.push({ name: rel, url: `${GH_BASE}/${vDir}/${rel}` });
          } else if (isBinary(rel)) {
            const result = await pushR2(abs, `${vDir}/${rel}`, mimeType(rel), r2DirFiles);
            if (result.skipped) skipped++; else uploaded++;
            newFiles.push({ name: rel, url: result.publicUrl });
            unlinkSync(abs); deleted++;
            console.log(`  ✗ deleted ${rel}`);
          }
        }

        const metaRaw = readFileSync(join(vPath, "Meta.toml"), "utf-8");
        const meta = parseToml(metaRaw);
        const previewFile = newFiles.find(f => f.name === "preview.png");
        const showcaseFile = newFiles.find(f => f.name === "Showcase.png");

        const slug = generateSlug(author.name, theme.name);
        let existingTheme = themes.find(t => t.slug === slug);
        const versionEntry = {
          version: ver.name,
          previewUrl: previewFile?.url || null,
          showcaseUrl: showcaseFile?.url || null,
          dirPath: vDir,
          date: meta.date || fileMtime(join(vPath, "Definition.toml")) || null,
          changelog: null,
          files: newFiles,
          injectsCss: existsSync(join(vPath, "Inject.css")),
        };

        if (existingTheme) {
          existingTheme.versions.unshift(versionEntry);
          existingTheme.versions.sort((a, b) => {
            const re = /(\d+)|(\D+)/g;
            const aParts = a.version.match(re) || []; const bParts = b.version.match(re) || [];
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
              const ap = aParts[i] || ""; const bp = bParts[i] || "";
              const an = parseInt(ap); const bn = parseInt(bp);
              if (!isNaN(an) && !isNaN(bn)) { if (an !== bn) return bn - an; }
              else { const c = ap.localeCompare(bp); if (c !== 0) return -c; }
            } return 0;
          });
          existingTheme.latestVersion = existingTheme.versions[0].version;
          existingTheme.previewUrl = existingTheme.versions[0].previewUrl;
          existingTheme.date = existingTheme.versions[0].date;
        } else {
          themes.push({
            id: slug, slug, name: theme.name, author: author.name,
            tags: Array.isArray(meta.tags) ? meta.tags : [],
            dirPath: relative(ROOT, themePath),
            description: meta.description || null,
            versions: [versionEntry],
            latestVersion: ver.name,
            previewUrl: versionEntry.previewUrl,
            date: versionEntry.date,
          });
        }
        console.log(`  ✓ added ${slug}/${ver.name}`);
      }
    }
  }
}

// ─── Phase 5: Convert remaining string entries, sync previewUrl ───

const existingJson = targetSet ? JSON.parse(readFileSync(THEMES_JSON, "utf-8")) : null;
for (const theme of themes) {
  for (const version of theme.versions) {
    if (!Array.isArray(version.files)) continue;
    version.files = version.files.map((f) => {
      if (typeof f === "string") {
        if (existingJson) {
          for (const oldT of existingJson) {
            for (const oldV of oldT.versions) {
              if (oldV.dirPath === version.dirPath && Array.isArray(oldV.files)) {
                for (const oldF of oldV.files) {
                  if (typeof oldF === "object" && oldF.name === f && oldF.url?.includes(R2_PUBLIC_BASE)) {
                    return { name: f, url: oldF.url };
                  }
                }
              }
            }
          }
        }
        return { name: f, url: `${GH_BASE}/${version.dirPath}/${f}` };
      }
      return f;
    });
  }
}

for (const theme of themes) {
  const latest = theme.versions?.[0];
  if (latest?.previewUrl) theme.previewUrl = latest.previewUrl;
}

writeFileSync(THEMES_JSON, JSON.stringify(themes, null, 2));

// ─── Cleanup temp files ───

for (const tf of tempFiles) {
  try { unlinkSync(tf); } catch {}
}

console.log(`\n✓ themes.json updated`);
console.log(`  Uploaded: ${uploaded}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Deleted: ${deleted}`);
