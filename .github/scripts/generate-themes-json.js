#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SRC = path.join(__dirname, "..", "..", "src");
const OUT = path.join(__dirname, "..", "..", "themes.json");

const GITHUB_OWNER = "CubicLauncherDevs";
const GITHUB_REPO = "Themes";
const GITHUB_BRANCH = "master";
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}`;

function rawUrl(relativePath) {
  const segments = relativePath.split("/").map(encodeURIComponent);
  return `${RAW_BASE}/${segments.join("/")}`;
}

function generateSlug(author, name) {
  const s = `${author}-${name}`;
  return s
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

    const themeMd = readFileSafe(path.join(themePath, "theme.md"));

    const versionDirs = fs
      .readdirSync(themePath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."));

    const versions = [];

    for (const vDir of versionDirs) {
      const versionName = vDir.name;
      const vPath = path.join(themePath, versionName);

      const files = fs.readdirSync(vPath);

      const zipFile = files.find((f) => f.toLowerCase().endsWith(".zip"));
      const previewFile = files.find((f) => f.toLowerCase() === "showcase.png");
      const changelogFile = files.find(
        (f) => f.toLowerCase() === "changelog.md",
      );

      if (!zipFile) continue;

      const filePath = path.join(vPath, zipFile);
      const zipDate = getFileDate(filePath);

      const relativeDir = path.relative(
        path.join(__dirname, "..", ".."),
        vPath,
      );
      const previewUrl = previewFile
        ? rawUrl(`${relativeDir}/${previewFile}`)
        : "";
      const zipUrl = rawUrl(`${relativeDir}/${zipFile}`);
      const changelog = changelogFile
        ? readFileSafe(path.join(vPath, changelogFile))
        : null;

      versions.push({
        version: versionName,
        previewUrl,
        zipUrl,
        zipName: zipFile,
        dirPath: relativeDir,
        date: zipDate,
        changelog,
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
      dirPath: path.relative(path.join(__dirname, "..", ".."), themePath),
      description: themeMd || null,
      versions,
      latestVersion: latest.version,
      previewUrl: latest.previewUrl,
      zipUrl: latest.zipUrl,
      zipName: latest.zipName,
      date: latest.date,
    });
  }
}

const output = JSON.stringify(themes, null, 2);
fs.writeFileSync(OUT, output);
console.log(`✓ themes.json generated with ${themes.length} themes`);
