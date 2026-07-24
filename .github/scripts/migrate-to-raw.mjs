#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "..", "src");

// ─── Helpers ────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function run(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: "pipe", timeout: 15000 });
  } catch (e) {
    return "";
  }
}

function listZipContents(zipPath) {
  const out = run(`unzip -l ${JSON.stringify(zipPath)}`, path.dirname(zipPath));
  const lines = out.split("\n");
  const files = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Archive:") || trimmed.startsWith("Length") || trimmed.startsWith("---") || trimmed.startsWith("--")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 4) {
      const fname = parts.slice(3).join(" ");
      if (fname && !fname.endsWith("/")) files.push(fname);
    }
  }
  return files;
}

function getUniqueDirs(files) {
  const dirs = new Set();
  for (const f of files) {
    const d = path.dirname(f);
    if (d !== ".") dirs.add(d.split("/")[0]);
  }
  return [...dirs];
}

function flattenExtract(tmpDir, destDir) {
  // Move all files from subdirectories of tmpDir up to destDir
  const moveFiles = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        moveFiles(full);
      } else {
        const dst = path.join(destDir, entry.name);
        if (!fs.existsSync(dst)) {
          fs.renameSync(full, dst);
        }
      }
    }
  };
  moveFiles(tmpDir);
}

// ─── theme.json → TOML converter ────────────────────────────

function tomlEscape(s) {
  if (s == null) return '""';
  const str = String(s);
  if (str.includes('"') || str.includes("\n") || str.includes("\\")) {
    return JSON.stringify(str);
  }
  return `"${str}"`;
}

function convertThemeJsonToToml(themeJson, bgFiles) {
  const v = themeJson.variables || {};
  const bgImage = themeJson.bg_image || bgFiles[0] || null;

  // Meta
  const meta = {
    name: themeJson.name || "Untitled",
    author: themeJson.author || "Unknown",
    version: themeJson.version || "V1",
    description: themeJson.description || "",
    injects_css: false,
  };
  const metaLines = [];
  for (const [k, val] of Object.entries(meta)) {
    if (typeof val === "boolean") metaLines.push(`${k} = ${val}`);
    else metaLines.push(`${k} = ${tomlEscape(val)}`);
  }

  const get = (key, fallback) => v[key] ?? fallback;

  // Background
  const bgLines = [];
  if (bgImage) bgLines.push(`reference_path = ${tomlEscape(bgImage)}`);
  const blur = get("--bg-image-blur");
  if (blur) bgLines.push(`image_blur = ${parseFloat(blur) || 0}`);
  const opacity = get("--bg-image-opacity");
  if (opacity != null) bgLines.push(`image_opacity = ${parseFloat(opacity) || 0.0}`);

  // Colors
  const colorMap = {
    accent: "--accent", "accent-rgb": "--accent-rgb", "accent-hover": "--accent-hover",
    "accent-active": "--accent-active", "accent-text": "--accent-text", "accent-subtle": "--accent-subtle",
    "accent-primary": "--accent-primary",
    "color-success": "--color-success", "color-success-rgb": "--color-success-rgb",
    "color-error": "--color-error", "color-error-rgb": "--color-error-rgb",
    "color-warning": "--color-warning", "color-warning-rgb": "--color-warning-rgb",
    "color-info": "--color-info", "color-info-rgb": "--color-info-rgb",
    "color-status-starting": "--color-status-starting", "color-status-started": "--color-status-started",
    "color-status-stopped": "--color-status-stopped", "color-status-error": "--color-status-error",
  };
  const colorLines = [];
  for (const [tomlKey, cssKey] of Object.entries(colorMap)) {
    const val = get(cssKey);
    if (val != null) colorLines.push(`${tomlKey} = ${tomlEscape(val)}`);
  }

  // Text
  const textMap = { primary: "--text-primary", secondary: "--text-secondary", muted: "--text-muted", accent: "--text-accent" };
  const textLines = [];
  for (const [tomlKey, cssKey] of Object.entries(textMap)) {
    const val = get(cssKey);
    if (val != null) textLines.push(`${tomlKey} = ${tomlEscape(val)}`);
  }

  // Backgrounds
  const bgKeys = {
    main: "--bg-main", sidebar: "--bg-sidebar", card: "--bg-card",
    "item-active": "--bg-item-active", overlay: "--bg-overlay", input: "--bg-input",
  };
  const bgSectLines = [];
  for (const [tomlKey, cssKey] of Object.entries(bgKeys)) {
    const val = get(cssKey);
    if (val != null) bgSectLines.push(`${tomlKey} = ${tomlEscape(val)}`);
  }

  // Borders
  const bordersMap = {
    color: "--border-color", border: "--border", "color-hover": "--border-color-hover",
    width: "--border-width", radius: "--border-radius", "radius-sm": "--border-radius-sm",
    "radius-lg": "--border-radius-lg",
  };
  const borderLines = [];
  for (const [tomlKey, cssKey] of Object.entries(bordersMap)) {
    const val = get(cssKey);
    if (val != null) borderLines.push(`${tomlKey} = ${tomlEscape(val)}`);
  }

  // Shadows
  const shadowMap = {
    "shadow-sm": "--shadow-sm", "shadow-md": "--shadow-md", "shadow-lg": "--shadow-lg",
    "glow-accent": "--glow-accent", "glow-accent-strong": "--glow-accent-strong",
    "glow-error": "--glow-error", "glow-success": "--glow-success",
  };
  const shadowLines = [];
  for (const [tomlKey, cssKey] of Object.entries(shadowMap)) {
    const val = get(cssKey);
    if (val != null) shadowLines.push(`${tomlKey} = ${tomlEscape(val)}`);
  }

  // Layout
  const layoutMap = {
    "font-family": "--font-family", "font-size-base": "--font-size-base",
    "font-size-sm": "--font-size-sm", "font-size-lg": "--font-size-lg",
    "transition-fast": "--transition-fast", "transition-base": "--transition-base",
    "transition-slow": "--transition-slow",
  };
  const layoutLines = [];
  for (const [tomlKey, cssKey] of Object.entries(layoutMap)) {
    const val = get(cssKey);
    if (val != null) layoutLines.push(`${tomlKey} = ${tomlEscape(val)}`);
  }

  // Others
  const othersMap = {
    "icon-filter": "--icon-filter", "icon-filter-accent": "--icon-filter-accent",
    "icon-filter-success": "--icon-filter-success", "icon-filter-error": "--icon-filter-error",
    "icon-filter-warning": "--icon-filter-warning", "icon-filter-info": "--icon-filter-info",
    "icon-filter-muted": "--icon-filter-muted",
    "scrollbar-track": "--scrollbar-track", "scrollbar-thumb": "--scrollbar-thumb",
    "scrollbar-thumb-hover": "--scrollbar-thumb-hover", "sidebar-width": "--sidebar-width",
  };
  const othersLines = [];
  for (const [tomlKey, cssKey] of Object.entries(othersMap)) {
    const val = get(cssKey);
    if (val != null) othersLines.push(`${tomlKey} = ${tomlEscape(val)}`);
  }
  const sidebarGrad = get("--bg-sidebar-gradient");
  if (sidebarGrad) othersLines.push(`bg-sidebar-gradient = ${tomlEscape(sidebarGrad)}`);
  const cardGrad = get("--bg-card-gradient");
  if (cardGrad) othersLines.push(`bg-card-gradient = ${tomlEscape(cardGrad)}`);

  const metaToml = metaLines.join("\n") + "\n";
  const defParts = [];
  if (bgLines.length > 0) defParts.push("[background]\n" + bgLines.join("\n"));
  if (colorLines.length > 0) defParts.push("[colors]\n" + colorLines.join("\n"));
  if (textLines.length > 0) defParts.push("[text]\n" + textLines.join("\n"));
  if (bgSectLines.length > 0) defParts.push("[backgrounds]\n" + bgSectLines.join("\n"));
  if (borderLines.length > 0) defParts.push("[borders]\n" + borderLines.join("\n"));
  if (shadowLines.length > 0) defParts.push("[shadows]\n" + shadowLines.join("\n"));
  if (layoutLines.length > 0) defParts.push("[layout]\n" + layoutLines.join("\n"));
  if (othersLines.length > 0) defParts.push("[others]\n" + othersLines.join("\n"));

  return { metaToml, definitionToml: defParts.join("\n\n") + "\n" };
}

// ─── Process each theme version ─────────────────────────────

const authorDirs = fs.readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("."));
let converted = 0;

for (const authorDir of authorDirs) {
  const themeDirs = fs.readdirSync(path.join(SRC, authorDir.name), { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const themeDir of themeDirs) {
    const themePath = path.join(SRC, authorDir.name, themeDir.name);
    const versionDirs = fs.readdirSync(themePath, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("."));

    for (const vDir of versionDirs) {
      const vPath = path.join(themePath, vDir.name);
      let files = fs.readdirSync(vPath);

      // Already raw? Check if Meta.toml + Definition.toml exist directly
      const hasMeta = files.some((f) => f.toLowerCase() === "meta.toml");
      const hasDef = files.some((f) => f.toLowerCase() === "definition.toml");
      if (hasMeta && hasDef) {
        continue;
      }

      // Find archive
      const archive = files.find((f) => {
        const lower = f.toLowerCase();
        return lower.endsWith(".cbth") || lower.endsWith(".zip");
      });
      if (!archive) {
        continue;
      }

      const archivePath = path.join(vPath, archive);
      console.log(`→ ${authorDir.name}/${themeDir.name}/${vDir.name} (${archive})`);

      // Extract to temp
      const tmpDir = path.join(vPath, ".tmp_extract");
      ensureDir(tmpDir);
      run(`unzip -o ${JSON.stringify(archivePath)} -d ${JSON.stringify(tmpDir)}`, vPath);
      if (!fs.existsSync(tmpDir)) {
        console.log(`  ⚠ unzip failed`);
        continue;
      }

      // Gather all extracted files recursively
      const gatherFiles = (dir, base = "") => {
        const result = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".")) continue;
          const rel = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            result.push(...gatherFiles(path.join(dir, entry.name), rel));
          } else {
            result.push(rel);
          }
        }
        return result;
      };
      const extractedFiles = gatherFiles(tmpDir);

      const hasTomlFiles = extractedFiles.some((f) => f.toLowerCase().endsWith(".toml"));
      const hasThemeJson = extractedFiles.some((f) => f.toLowerCase().endsWith("theme.json"));

      if (hasTomlFiles) {
        // TOML format: flatten and move everything to vPath
        flattenExtract(tmpDir, vPath);
        console.log(`  ✓ extracted ${archive}`);
      } else if (hasThemeJson) {
        // Old format: find and convert theme.json
        const tjRel = extractedFiles.find((f) => f.toLowerCase().endsWith("theme.json"));
        const tjPath = path.join(tmpDir, tjRel);
        const themeJson = JSON.parse(fs.readFileSync(tjPath, "utf-8"));

        const bgFiles = extractedFiles.filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
        const { metaToml, definitionToml } = convertThemeJsonToToml(themeJson, bgFiles);

        fs.writeFileSync(path.join(vPath, "Meta.toml"), metaToml);
        fs.writeFileSync(path.join(vPath, "Definition.toml"), definitionToml);

        // Move over other files (bg, fonts, etc.), skip theme.json
        const skipFiles = new Set(extractedFiles.filter((f) => f.toLowerCase().endsWith("theme.json")));
        for (const rel of extractedFiles) {
          if (skipFiles.has(rel)) continue;
          const src = path.join(tmpDir, rel);
          const dst = path.join(vPath, path.basename(rel));
          if (!fs.existsSync(dst)) {
            fs.renameSync(src, dst);
          }
        }
        console.log(`  ✓ converted ${archive} → Meta.toml + Definition.toml`);
      } else {
        console.log(`  ⚠ unknown format, files: ${extractedFiles.slice(0, 5).join(", ")}`);
      }

      // Cleanup
      run(`rm -rf ${JSON.stringify(tmpDir)}`, vPath);
      if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
      converted++;
    }
  }
}

console.log(`\n✅ Done! ${converted} theme versions processed.`);
