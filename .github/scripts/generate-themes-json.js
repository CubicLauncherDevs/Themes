#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SRC = path.join(__dirname, "..", "..", "src");
const OUT = path.join(__dirname, "..", "..", "themes.json");

const GITHUB_OWNER = "santiagolxx";
const GITHUB_REPO = "asdasd";
const GITHUB_BRANCH = "master";
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/refs/heads/${GITHUB_BRANCH}`;

function rawUrl(relativePath) {
  const segments = relativePath.split("/").map(encodeURIComponent);
  return `${RAW_BASE}/${segments.join("/")}`;
}

function generateSlug(author, name) {
  return `${author}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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

function getFileDate(filePath) {
  try {
    const rel = path.relative(path.join(__dirname, "..", ".."), filePath);
    const log = execSync(`git log -1 --format="%aI" -- "${rel}"`, {
      cwd: path.join(__dirname, "..", ".."),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    return log || null;
  } catch {
    return null;
  }
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

// ─── TOML parser (minimal, only for Meta.toml) ──────────────

function parseTomlArray(str) {
  // Parse TOML inline array: ["a", "b", "c"]
  const inner = str.replace(/^\[|\]$/g, "").trim();
  if (!inner) return [];
  const items = [];
  let current = "";
  let inQuote = false;
  for (const ch of inner) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function parseTomlValue(val) {
  const trimmed = val.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return parseTomlArray(trimmed);
  return trimmed;
}

function parseToml(text) {
  const result = {};
  let currentSection = result;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      result[sectionMatch[1]] = result[sectionMatch[1]] || {};
      currentSection = result[sectionMatch[1]];
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = parseTomlValue(trimmed.slice(eqIdx + 1));
    currentSection[key] = val;
  }
  return result;
}

// ─── Build theme index ──────────────────────────────────────

const themes = [];

const authorDirs = fs
  .readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("."));

for (const authorDir of authorDirs) {
  const author = authorDir.name;
  const themeDirs = fs
    .readdirSync(path.join(SRC, author), { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const themeDir of themeDirs) {
    const name = themeDir.name;
    const themePath = path.join(SRC, author, name);
    const slug = generateSlug(author, name);

    // Read theme description from theme.md or Meta.toml of latest version
    const themeMd = readFileSafe(path.join(themePath, "theme.md"));

    const versionDirs = fs
      .readdirSync(themePath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."));

    const versions = [];
    let mergedTags = [];
    let metaAuthor = author;
    let metaName = name;
    let metaDescription = null;

    for (const vDir of versionDirs) {
      const versionName = vDir.name;
      const vPath = path.join(themePath, versionName);

      // Check for raw TOML files
      const hasMeta = fs.existsSync(path.join(vPath, "Meta.toml"));
      const hasDef = fs.existsSync(path.join(vPath, "Definition.toml"));
      if (!hasMeta || !hasDef) continue;

      const previewFile = fs.readdirSync(vPath).find((f) => f.toLowerCase() === "preview.png");
      const showcaseFile = fs.readdirSync(vPath).find((f) => f.toLowerCase() === "showcase.png");
      const changelogFile = fs.readdirSync(vPath).find((f) => f.toLowerCase() === "changelog.md");

      const relativeDir = path.relative(path.join(__dirname, "..", ".."), vPath);

      // Read Meta.toml for tags
      const metaContent = readFileSafe(path.join(vPath, "Meta.toml"));
      let tags = [];

      let injectsCss = false;
      if (metaContent) {
        const meta = parseToml(metaContent);
        if (Array.isArray(meta.tags)) {
          tags = meta.tags;
        }
        if (meta.author) metaAuthor = meta.author;
        if (meta.name) metaName = meta.name;
        if (meta.description) metaDescription = meta.description;
        if (meta.injects_css) injectsCss = meta.injects_css === true || meta.injects_css === "true";
      }
      mergedTags = [...new Set([...mergedTags, ...tags])];

      // Collect files available for download (recursive)
      function collectFiles(dir, base = "") {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const result = [];
        for (const entry of entries) {
          if (entry.name.startsWith(".")) continue;
          const lower = entry.name.toLowerCase();
          if (lower === "changelog.md" || lower === "showcase.png" || lower === "preview.png") continue;
          const relPath = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            result.push(...collectFiles(path.join(dir, entry.name), relPath));
          } else {
            result.push(relPath);
          }
        }
        return result;
      }
      const versionFiles = collectFiles(vPath);

      const palettePreview = previewFile
        ? rawUrl(`${relativeDir}/${previewFile}`)
        : null;
      const showcaseUrl = showcaseFile
        ? rawUrl(`${relativeDir}/${showcaseFile}`)
        : null;

      const changelog = changelogFile
        ? readFileSafe(path.join(vPath, changelogFile))
        : null;

      // Use date from Meta.toml or git
      let date = null;
      if (metaContent) {
        const meta = parseToml(metaContent);
        if (meta.date) date = meta.date;
      }
      if (!date) {
        // Try to get date from git on any version file
        const anyFile = fs.readdirSync(vPath).find((f) => !f.startsWith(".") && f !== "Showcase.png" && f !== "preview.png");
        if (anyFile) {
          date = getFileDate(path.join(vPath, anyFile));
        }
      }

      versions.push({
        version: versionName,
        previewUrl: palettePreview,
        showcaseUrl,
        dirPath: relativeDir,
        date,
        changelog,
        files: versionFiles,
        injectsCss,
      });
    }

    if (versions.length === 0) continue;

    versions.sort((a, b) => -naturalSort(a.version, b.version));
    const latest = versions[0];

    themes.push({
      id: slug,
      slug,
      name,
      author,
      tags: mergedTags,
      dirPath: path.relative(path.join(__dirname, "..", ".."), themePath),
      description: themeMd || metaDescription || null,
      versions,
      latestVersion: latest.version,
      previewUrl: latest.previewUrl,
      date: latest.date,
    });
  }
}

const output = JSON.stringify(themes, null, 2);
fs.writeFileSync(OUT, output);
console.log(`✓ themes.json generated with ${themes.length} themes`);
