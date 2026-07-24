#!/usr/bin/env node

import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

// ---- ENV ----

const { R2_S3_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE } = process.env;
if (!R2_S3_URL || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_BASE) {
  console.error("Missing env vars: R2_S3_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE");
  process.exit(1);
}

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

// ---- Main ----

const ROOT = new URL("..", import.meta.url).pathname;
const THEMES_JSON = join(ROOT, "themes.json");

const targetDirs = process.argv.slice(2).filter(a => !a.startsWith("--"));
const targetSet = targetDirs.length ? new Set(targetDirs.map(d => d.replace(/\/+$/, ""))) : null;

if (!existsSync(THEMES_JSON)) {
  console.error("themes.json not found");
  process.exit(1);
}

const themes = JSON.parse(readFileSync(THEMES_JSON, "utf-8"));

let uploaded = 0, skipped = 0, deleted = 0;

for (const theme of themes) {
  for (const version of theme.versions) {
    if (targetSet && !targetSet.has(version.dirPath)) continue;

    const vDir = join(ROOT, version.dirPath);

    // Scan ALL files on disk for this version
    const diskFiles = [];
    if (existsSync(vDir)) {
      function scan(dir, base) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".")) continue;
          const rel = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory()) scan(join(dir, entry.name), rel);
          else diskFiles.push({ rel, abs: join(dir, entry.name) });
        }
      }
      scan(vDir, "");
    }

    // For target dirs: merge disk files with existing R2 entries
    // For non-target dirs: keep existing files[] as-is
    if (!targetSet || targetSet.has(version.dirPath)) {
      const newFiles = [];
      const processed = new Set();

      for (const { rel, abs } of diskFiles) {
        processed.add(rel);
        if (isText(rel)) {
          newFiles.push({ name: rel, url: `${GH_BASE}/${version.dirPath}/${rel}` });
        } else if (isBinary(rel)) {
          const hash = hashFile(abs);
          const ext = rel.split(".").pop();
          const nameWithoutExt = rel.slice(0, -ext.length - 1);
          const hashedName = `${nameWithoutExt}.${hash}.${ext}`;
          const r2Key = `${version.dirPath}/${hashedName}`;
          const publicUrl = `${R2_PUBLIC_BASE}/${r2Key}`;

          let needsUpload = true;
          try {
            await s3.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: r2Key }));
            needsUpload = false;
          } catch { /* not found */ }

          if (needsUpload) {
            const body = readFileSync(abs);
            await s3.send(new PutObjectCommand({
              Bucket: r2Bucket, Key: r2Key, Body: body,
              ContentType: mimeType(rel),
              CacheControl: "public, max-age=31536000, immutable",
            }));
            uploaded++;
            console.log(`  ↑ ${r2Key}`);
          } else {
            skipped++;
          }

          newFiles.push({ name: rel, url: publicUrl });

          unlinkSync(abs);
          deleted++;
          console.log(`  ✗ deleted ${rel}`);
        }
      }

      // Preserve existing entries for files NOT on disk (e.g. previously uploaded binaries)
      if (Array.isArray(version.files)) {
        for (const existing of version.files) {
          const name = typeof existing === "string" ? existing : existing.name;
          if (!processed.has(name)) {
            // Only keep if it has an R2 URL (binary already uploaded)
            if (typeof existing === "object" && existing.url?.startsWith(R2_PUBLIC_BASE)) {
              newFiles.push(existing);
            }
            // Text files not on disk are dropped (they should always exist)
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
}

// ─── Discover NEW themes/versions not yet in themes.json ───

const existingDirs = new Set();
for (const t of themes) {
  for (const v of t.versions) existingDirs.add(v.dirPath);
}

function generateSlug(author, name) {
  return `${author}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fileMtime(fp) {
  try { return execSync(`git log -1 --format="%aI" -- "${relative(ROOT, fp)}"`, { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}

function parseToml(text) {
  const result = {};
  let sec = result;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
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

        // Process files
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

        const newFiles = [];
        for (const { rel, abs } of diskFiles) {
          if (isText(rel)) {
            newFiles.push({ name: rel, url: `${GH_BASE}/${vDir}/${rel}` });
          } else if (isBinary(rel)) {
            const hash = hashFile(abs);
            const ext = rel.split(".").pop();
            const baseName = rel.slice(0, -ext.length - 1);
            const hashedName = `${baseName}.${hash}.${ext}`;
            const r2Key = `${vDir}/${hashedName}`;
            const publicUrl = `${R2_PUBLIC_BASE}/${r2Key}`;

            let needsUpload = true;
            try { await s3.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: r2Key })); needsUpload = false; } catch {}
            if (needsUpload) {
              const body = readFileSync(abs);
              await s3.send(new PutObjectCommand({
                Bucket: r2Bucket, Key: r2Key, Body: body,
                ContentType: mimeType(rel),
                CacheControl: "public, max-age=31536000, immutable",
              }));
              uploaded++;
              console.log(`  ↑ ${r2Key}`);
            } else { skipped++; }
            newFiles.push({ name: rel, url: publicUrl });
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

// Convert any remaining string entries in files[] to { name, url }
// (preserves existing R2 URLs for non-target, non-new themes)
const existingJson = targetSet ? JSON.parse(readFileSync(THEMES_JSON, "utf-8")) : null;
for (const theme of themes) {
  for (const version of theme.versions) {
    if (!Array.isArray(version.files)) continue;
    version.files = version.files.map((f) => {
      if (typeof f === "string") {
        // Check if the previous themes.json had an R2 URL for this file
        if (existingJson) {
          for (const oldT of existingJson) {
            for (const oldV of oldT.versions) {
              if (oldV.dirPath === version.dirPath && Array.isArray(oldV.files)) {
                for (const oldF of oldV.files) {
                  if (typeof oldF === "object" && oldF.name === f && oldF.url?.startsWith(R2_PUBLIC_BASE)) {
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

// Sync theme-level previewUrl to latest version
for (const theme of themes) {
  const latest = theme.versions?.[0];
  if (latest?.previewUrl) theme.previewUrl = latest.previewUrl;
}

writeFileSync(THEMES_JSON, JSON.stringify(themes, null, 2));
console.log(`\n✓ themes.json updated`);
console.log(`  Uploaded: ${uploaded}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Deleted: ${deleted}`);
