#!/usr/bin/env node

/**
 * Uploads binary assets to Cloudflare R2 and rewrites JSON references.
 *
 * Reads themes.json, finds all binary files in version directories,
 * uploads them to R2 with hash-based filenames, and updates all URLs
 * in the JSON files to point to R2.
 *
 * ENV:
 *   R2_S3_URL        - Full S3 endpoint (e.g. https://xxx.r2.cloudflarestorage.com/bucket)
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_PUBLIC_BASE   - Public URL base (no trailing slash)
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// ---- ENV ----

const R2_S3_URL = process.env.R2_S3_URL;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE;

const missing = [];
if (!R2_S3_URL) missing.push("R2_S3_URL");
if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
if (!R2_PUBLIC_BASE) missing.push("R2_PUBLIC_BASE");
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

// ---- S3 client ----

// R2_S3_URL includes the bucket path, extract bucket name
const r2Url = new URL(R2_S3_URL);
const r2Endpoint = `${r2Url.protocol}//${r2Url.host}`;
const r2Bucket = r2Url.pathname.replace(/^\//, "").replace(/\/$/, "");

const s3 = new S3Client({
  endpoint: r2Endpoint,
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ---- Helpers ----

const BINARY_RE = /\.(png|jpg|jpeg|webp|gif|svg|mp4|webm|zip|ttf|woff|woff2|otf|eot)$/i;

function hashFile(filePath) {
  const h = createHash("sha256");
  h.update(readFileSync(filePath));
  return h.digest("hex").slice(0, 8);
}

function mimeType(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();
  const map = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
    mp4: "video/mp4", webm: "video/webm",
    zip: "application/zip",
    ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2", otf: "font/otf", eot: "font/eot",
  };
  return map[ext] || "application/octet-stream";
}

function isBinary(fileName) {
  return BINARY_RE.test(fileName);
}

function isTextFile(fileName) {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".toml") || lower.endsWith(".css") || lower.endsWith(".md") || lower.endsWith(".txt");
}

// ---- Main ----

const ROOT = new URL("..", import.meta.url).pathname;
const THEMES_JSON = join(ROOT, "themes.json");
const SRC = join(ROOT, "src");

if (!existsSync(THEMES_JSON)) {
  console.error("themes.json not found");
  process.exit(1);
}

const themes = JSON.parse(readFileSync(THEMES_JSON, "utf-8"));

let uploaded = 0;
let skipped = 0;
let deleted = 0;

for (const theme of themes) {
  for (const version of theme.versions) {
    const vDir = join(ROOT, version.dirPath);

    // Scan directory for all files
    const entries = [];
    function scan(dir, base) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          scan(join(dir, entry.name), rel);
        } else {
          entries.push({ rel, abs: join(dir, entry.name) });
        }
      }
    }
    scan(vDir, "");

    for (const { rel, abs } of entries) {
      if (!isBinary(rel)) continue;
      if (!existsSync(abs)) continue;

      const hash = hashFile(abs);
      const ext = rel.split(".").pop();
      const nameWithoutExt = rel.slice(0, -ext.length - 1);
      const hashedName = `${nameWithoutExt}.${hash}.${ext}`;
      const r2Key = `${version.dirPath}/${hashedName}`;
      const publicUrl = `${R2_PUBLIC_BASE}/${r2Key}`;

      // Check if already uploaded
      let needsUpload = true;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: r2Key }));
        needsUpload = false;
      } catch { /* not found, upload */ }

      if (needsUpload) {
        const body = readFileSync(abs);
        await s3.send(new PutObjectCommand({
          Bucket: r2Bucket,
          Key: r2Key,
          Body: body,
          ContentType: mimeType(rel),
          CacheControl: "public, max-age=31536000, immutable",
        }));
        uploaded++;
        console.log(`  ↑ ${r2Key}`);
      } else {
        skipped++;
      }

      // Update files[] in themes.json
      if (Array.isArray(version.files)) {
        version.files = version.files.map((f) => {
          if (typeof f === "string" && f === rel) {
            return { name: rel, url: publicUrl };
          }
          if (typeof f === "object" && f.name === rel) {
            return { name: rel, url: publicUrl };
          }
          return f;
        });
      }

      // Also update standalone URL fields
      for (const field of ["previewUrl", "showcaseUrl"]) {
        const val = version[field];
        if (val && typeof val === "string" && val.includes(rel)) {
          version[field] = publicUrl;
        }
      }

      // Delete local binary
      unlinkSync(abs);
      deleted++;
      console.log(`  ✗ deleted ${rel}`);
    }
  }
}

// Convert any remaining string files[] entries to { name, url } format
// (text files get GitHub raw URLs)
for (const theme of themes) {
  for (const version of theme.versions) {
    if (!Array.isArray(version.files)) continue;
    version.files = version.files.map((f) => {
      if (typeof f === "string") {
        const name = f;
        const url = `https://raw.githubusercontent.com/santiagolxx/asdasd/refs/heads/master/${version.dirPath}/${name}`;
        return { name, url };
      }
      return f;
    });
  }
}

writeFileSync(THEMES_JSON, JSON.stringify(themes, null, 2));
console.log(`\n✓ themes.json updated`);
console.log(`  Uploaded: ${uploaded}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Deleted: ${deleted}`);
