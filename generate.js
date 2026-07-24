// generate.js
// Genera una "tarjeta de tema" tipo showcase de paleta de colores,
// como las que se ven en sitios de temas para launchers/apps.
//
// Uso:
//   node generate.js config.json salida.png          # desde config manual
//   node generate.js --dir src/Autor/Theme/V1        # desde directorio de versión
//   node generate.js --all src/                       # procesa todas las versiones

const { createCanvas, loadImage } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

// ---------- Parsers ----------

function parseToml(text) {
  const result = {};
  let currentSection = result;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      const section = sectionMatch[1];
      result[section] = result[section] || {};
      currentSection = result[section];
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    currentSection[key] = val;
  }
  return result;
}

function readTomlFile(filePath) {
  return parseToml(fs.readFileSync(filePath, "utf8"));
}

function hexToRgb(hex) {
  const c = hex.replace("#", "");
  return {
    r: parseInt(c.substring(0, 2), 16),
    g: parseInt(c.substring(2, 4), 16),
    b: parseInt(c.substring(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
}

// ---------- Default config ----------

const DEFAULTS = {
  width: 1600,
  height: 900,
  title: "Untitled",
  author: "Unknown",
  tag: "Theme",
  sidebarWidth: 640,
  sidebarBg: "#fdf7f8",
  titleColor: "#2f2530",
  metaColor: "#9d8d91",
  swatchLabelColor: "#3a3038",
  swatchHexColor: "#8d7d82",
  backgroundImage: null,
  mockup: true,
  colors: [
    { label: "bg-main", hex: "#faf6f7" },
    { label: "bg-sidebar", hex: "#f5ecee" },
    { label: "bg-item-active", hex: "#f7dfe3" },
    { label: "accent", hex: "#e08fa0" },
    { label: "accent-hover", hex: "#e9a6b3" },
    { label: "text-primary", hex: "#4a3d41" },
    { label: "text-muted", hex: "#9d8d91" },
    { label: "border-color", hex: "#e8d7db" },
  ],
};

function deepMerge(base, override) {
  const out = { ...base };
  for (const k in override) {
    if (override[k] && typeof override[k] === "object" && !Array.isArray(override[k])) {
      out[k] = deepMerge(base[k] || {}, override[k]);
    } else {
      out[k] = override[k];
    }
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  const radii = typeof r === "number" ? [r, r, r, r] : r;
  ctx.beginPath();
  ctx.moveTo(x + radii[0], y);
  ctx.lineTo(x + w - radii[1], y);
  ctx.arcTo(x + w, y, x + w, y + radii[1], radii[1]);
  ctx.lineTo(x + w, y + h - radii[2]);
  ctx.arcTo(x + w, y + h, x + w - radii[2], y + h, radii[2]);
  ctx.lineTo(x + radii[3], y + h);
  ctx.arcTo(x, y + h, x, y + h - radii[3], radii[3]);
  ctx.lineTo(x, y + radii[0]);
  ctx.arcTo(x, y, x + radii[0], y, radii[0]);
  ctx.closePath();
}

function readableTextOn(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#00000099" : "#ffffffcc";
}

async function drawMockup(ctx, x, y, w, h, cfg) {
  const find = (label, fallback) =>
    (cfg.colors.find((c) => c.label === label) || {}).hex || fallback;

  const bgMain = find("bg-main", "#ffffff");
  const bgItem = find("bg-item-active", "#eeeeee");
  const accent = find("accent", "#cc6677");
  const border = find("border-color", "#dddddd");

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = bgMain;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();

  const pad = w * 0.08;
  ctx.fillStyle = bgItem;
  roundRect(ctx, x + pad, y + h * 0.14, w * 0.28, h * 0.09, 6);
  ctx.fill();
  roundRect(ctx, x + pad, y + h * 0.34, w * 0.84, h * 0.07, 6);
  ctx.fill();
  roundRect(ctx, x + pad, y + h * 0.5, w * 0.66, h * 0.07, 6);
  ctx.fill();
  ctx.fillStyle = accent;
  roundRect(ctx, x + w - pad - w * 0.22, y + h - pad - h * 0.11, w * 0.22, h * 0.11, 8);
  ctx.fill();
}

function createAbstractGradient(ctx, x, y, w, h, colors) {
  // Draw a gradient background using the theme colors
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  const step = 1 / Math.max(colors.length - 1, 1);
  for (let i = 0; i < colors.length; i++) {
    gradient.addColorStop(i * step, colors[i].hex);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  // Add some geometric shapes for visual interest
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 5; i++) {
    const circleX = x + Math.random() * w;
    const circleY = y + Math.random() * h;
    const radius = 80 + Math.random() * 200;
    const c = colors[i % colors.length];
    ctx.beginPath();
    ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
    ctx.fillStyle = c.hex;
    ctx.fill();
  }
  ctx.restore();
}

// ---------- Build config from theme dir ----------

function buildConfigFromDir(versionDir) {
  const metaPath = path.join(versionDir, "Meta.toml");
  const defPath = path.join(versionDir, "Definition.toml");

  if (!fs.existsSync(metaPath) || !fs.existsSync(defPath)) {
    throw new Error(`Missing Meta.toml or Definition.toml in ${versionDir}`);
  }

  const meta = readTomlFile(metaPath);
  const def = readTomlFile(defPath);

  const colors = def.colors || {};
  const text = def.text || {};
  const backgrounds = def.backgrounds || {};
  const borders = def.borders || {};
  const layout = def.layout || {};
  const bg = def.background || {};

  // Pick the best background image
  let bgImage = null;
  const bgRef = bg.reference_path || "";
  if (bgRef) {
    const bgPath = path.join(versionDir, bgRef);
    if (fs.existsSync(bgPath)) bgImage = bgPath;
  }
  // Fallback: try common names
  if (!bgImage) {
    for (const name of ["bg.png", "bg.jpg", "bg.jpeg", "bg.gif", "bg.webp"]) {
      const p = path.join(versionDir, name);
      if (fs.existsSync(p)) { bgImage = p; break; }
    }
  }

  // Build palette entries
  const paletteColors = [];

  // Background colors (most important for palette display)
  if (backgrounds.main) paletteColors.push({ label: "bg-main", hex: backgrounds.main });
  if (backgrounds.sidebar) paletteColors.push({ label: "bg-sidebar", hex: backgrounds.sidebar });
  if (backgrounds.card) paletteColors.push({ label: "bg-card", hex: backgrounds.card });
  if (backgrounds["item-active"]) paletteColors.push({ label: "bg-item-active", hex: backgrounds["item-active"] });

  // Accent
  if (colors.accent) paletteColors.push({ label: "accent", hex: colors.accent });
  if (colors["accent-hover"]) paletteColors.push({ label: "accent-hover", hex: colors["accent-hover"] });

  // Text
  if (text.primary) paletteColors.push({ label: "text-primary", hex: text.primary });
  if (text.secondary) paletteColors.push({ label: "text-secondary", hex: text.secondary });
  if (text.muted) paletteColors.push({ label: "text-muted", hex: text.muted });

  // Borders
  if (borders.color) paletteColors.push({ label: "border-color", hex: borders.color });
  if (borders["color-hover"]) paletteColors.push({ label: "border-hover", hex: borders["color-hover"] });

  // Semantic colors
  if (colors["color-success"]) paletteColors.push({ label: "success", hex: colors["color-success"] });
  if (colors["color-error"]) paletteColors.push({ label: "error", hex: colors["color-error"] });
  if (colors["color-warning"]) paletteColors.push({ label: "warning", hex: colors["color-warning"] });

  // Pick sidebar bg for the panel
  const sidebarBg = backgrounds.sidebar || backgrounds.main || "#f5f5f5";

  // Title color from text-primary, or derive from sidebar
  const titleColor = text.primary || "#2f2530";
  const metaColor = text.secondary || text.muted || "#9d8d91";

  const isLight = (hex) => {
    if (!hex || hex === "transparent") return true;
    const c = hexToRgb(hex);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 > 0.5;
  };
  const lightSidebar = isLight(sidebarBg);

  return {
    title: meta.name || "Untitled",
    author: meta.author || "Unknown",
    tag: `v${meta.version || "1.0"}`,
    sidebarBg: sidebarBg,
    titleColor: lightSidebar ? "#1a1a1a" : "#f5f5f5",
    metaColor: lightSidebar ? "#888888" : "#aaaaaa",
    swatchLabelColor: lightSidebar ? "#333333" : "#dddddd",
    swatchHexColor: lightSidebar ? "#888888" : "#999999",
    backgroundImage: bgImage,
    mockup: true,
    colors: paletteColors.slice(0, 12), // max 12 colors
  };
}

// ---------- Main generate function ----------

async function generate(configPathOrDir, outPath) {
  let cfg;

  if (configPathOrDir === "--dir" && outPath) {
    // mode: --dir <versionDir> -> generates <versionDir>/preview.png
    const versionDir = outPath;
    outPath = path.join(versionDir, "preview.png");
    cfg = deepMerge(DEFAULTS, buildConfigFromDir(versionDir));
    // If there's no background image, generate an abstract gradient
    if (!cfg.backgroundImage) {
      cfg.backgroundImage = "__gradient__";
    }
  } else if (configPathOrDir === "--all") {
    // Process all versions under the given directory
    const rootDir = outPath || "src";
    let count = 0;
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const author of entries.filter((d) => d.isDirectory() && !d.name.startsWith("."))) {
      const authorPath = path.join(rootDir, author.name);
      for (const theme of fs.readdirSync(authorPath, { withFileTypes: true }).filter((d) => d.isDirectory())) {
        const themePath = path.join(authorPath, theme.name);
        for (const ver of fs.readdirSync(themePath, { withFileTypes: true }).filter((d) => d.isDirectory())) {
          const verPath = path.join(themePath, ver.name);
          const previewPath = path.join(verPath, "preview.png");
          // Skip if already generated (but always regenerate if forced)
          if (fs.existsSync(previewPath) && !process.env.FORCE) continue;
          if (!fs.existsSync(path.join(verPath, "Meta.toml")) || !fs.existsSync(path.join(verPath, "Definition.toml"))) continue;
          try {
            await generate("--dir", verPath);
            count++;
          } catch (e) {
            console.error(`  ✗ ${author.name}/${theme.name}/${ver.name}: ${e.message}`);
          }
        }
      }
    }
    console.log(`Done! Generated ${count} previews.`);
    return;
  } else {
    // Manual config mode
    const userCfg = JSON.parse(fs.readFileSync(configPathOrDir, "utf8"));
    cfg = deepMerge(DEFAULTS, userCfg);
  }

  const canvas = createCanvas(cfg.width, cfg.height);
  const ctx = canvas.getContext("2d");

  const artWidth = cfg.width - cfg.sidebarWidth;

  // ---------- Left: art area ----------
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, artWidth, cfg.height);

  if (cfg.backgroundImage && cfg.backgroundImage !== "__gradient__" && fs.existsSync(cfg.backgroundImage)) {
    const img = await loadImage(cfg.backgroundImage);
    const scale = Math.max(artWidth / img.width, cfg.height / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (artWidth - dw) / 2;
    const dy = (cfg.height - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  } else if (cfg.backgroundImage === "__gradient__" || !cfg.backgroundImage) {
    // Generate abstract gradient from theme colors
    createAbstractGradient(ctx, 0, 0, artWidth, cfg.height, cfg.colors);
  }

  if (cfg.mockup) {
    const mw = artWidth * 0.42;
    const mh = mw * 0.62;
    const mx = artWidth * 0.34;
    const my = cfg.height * 0.3;
    await drawMockup(ctx, mx, my, mw, mh, cfg);
  }

  // ---------- Right: palette panel ----------
  const sx = artWidth;
  ctx.fillStyle = cfg.sidebarBg;
  ctx.fillRect(sx, 0, cfg.sidebarWidth, cfg.height);

  const padX = 60;
  let cursorY = 90;

  ctx.fillStyle = cfg.titleColor;
  ctx.font = "bold 40px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(cfg.title, sx + padX, cursorY);

  cursorY += 32;
  ctx.fillStyle = cfg.metaColor;
  ctx.font = "18px sans-serif";
  const metaParts = [cfg.author && `by ${cfg.author}`, cfg.tag].filter(Boolean).join("   ·   ");
  ctx.fillText(metaParts, sx + padX, cursorY);

  cursorY += 44;

  const rowH = 42;
  const swatchR = 13;

  for (const color of cfg.colors) {
    const cy = cursorY + swatchR;

    ctx.beginPath();
    ctx.arc(sx + padX + swatchR, cy, swatchR, 0, Math.PI * 2);
    ctx.fillStyle = color.hex;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.stroke();

    ctx.fillStyle = cfg.swatchLabelColor;
    ctx.font = "16px sans-serif";
    ctx.fillText(color.label, sx + padX + swatchR * 2 + 16, cy + 5);

    ctx.fillStyle = cfg.swatchHexColor;
    ctx.font = "15px monospace";
    const hexText = color.hex.toUpperCase();
    const hexW = ctx.measureText(hexText).width;
    ctx.fillText(
      hexText,
      sx + cfg.sidebarWidth - padX - hexW,
      cy + 5
    );

    cursorY += rowH;
  }

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outPath, buffer);
  if (configPathOrDir !== "--dir" || !configPathOrDir) {
    console.log("OK ->", outPath);
  }
}

// ---------- CLI entry ----------

const [, , arg1, arg2] = process.argv;

if (!arg1) {
  console.error("Usage:");
  console.error("  node generate.js config.json [salida.png]");
  console.error("  node generate.js --dir src/Autor/Theme/V1");
  console.error("  node generate.js --all [src/]");
  process.exit(1);
}

generate(arg1, arg2).catch((e) => {
  console.error(e);
  process.exit(1);
});
