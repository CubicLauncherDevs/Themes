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

// ---------- Animated GIF handling ----------

function isGifFile(filePath) {
  return /\.gif$/i.test(filePath);
}

function contentScore(data) {
  const step = 16; // sample every 4th pixel (RGBA)
  const counts = new Map();
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] === 0) continue;
    const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size === 0) return 0;

  let bgKey = null;
  let bgCount = -1;
  for (const [key, count] of counts) {
    if (count > bgCount) {
      bgCount = count;
      bgKey = key;
    }
  }

  const [br, bg, bb] = bgKey.split(",").map(Number);
  let score = 0;
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] === 0) continue;
    const dr = (data[i] >> 4) - br;
    const dg = (data[i + 1] >> 4) - bg;
    const db = (data[i + 2] >> 4) - bb;
    if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) > 1) score++;
  }
  return score;
}

function frameToCanvas(data, width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(data);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// @napi-rs/canvas only decodes the first frame of animated GIFs. Many GIFs
// start with an empty/black frame, so pick the most representative one.
function loadGifFrame(filePath) {
  const { parseGIF, decompressFrames } = require("gifuct-js");
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const gif = parseGIF(arrayBuffer);
  const frames = decompressFrames(gif, true);
  const width = gif.lsd.width;
  const height = gif.lsd.height;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  let firstData = null;
  let firstScore = 0;
  let bestData = null;
  let bestScore = -1;
  let prevDisposal = 0;
  let prevDims = null;
  let savedData = null;

  for (let index = 0; index < frames.length; index++) {
    const { dims, patch, disposalType } = frames[index];

    if (prevDisposal === 2 && prevDims) {
      ctx.clearRect(prevDims.left, prevDims.top, prevDims.width, prevDims.height);
    } else if (prevDisposal === 3 && savedData) {
      ctx.putImageData(savedData, 0, 0);
    }

    if (disposalType === 3) {
      savedData = ctx.getImageData(0, 0, width, height);
    }

    const patchCanvas = createCanvas(dims.width, dims.height);
    const patchCtx = patchCanvas.getContext("2d");
    const patchData = patchCtx.createImageData(dims.width, dims.height);
    patchData.data.set(patch);
    patchCtx.putImageData(patchData, 0, 0);
    ctx.drawImage(patchCanvas, dims.left, dims.top);

    const data = ctx.getImageData(0, 0, width, height).data;
    const score = contentScore(data);
    if (index === 0) {
      firstData = new Uint8ClampedArray(data);
      firstScore = score;
    }
    if (score > bestScore) {
      bestScore = score;
      bestData = new Uint8ClampedArray(data);
    }

    prevDisposal = disposalType;
    prevDims = dims;
  }

  // Keep the existing output for GIFs whose first frame already has content.
  const useFirst = firstData && (bestScore <= 0 || firstScore >= bestScore * 0.5);
  const chosen = useFirst ? firstData : bestData;
  return chosen ? frameToCanvas(chosen, width, height) : canvas;
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

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function seededRandom(seed) {
  let state = 0;
  for (let i = 0; i < seed.length; i++) state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic fallback for themes without a background image. Uses the
// theme palette so the preview stays representative and reproducible.
function drawFallbackBackground(ctx, x, y, w, h, cfg) {
  const find = (label, fallback) =>
    (cfg.colors.find((c) => c.label === label) || {}).hex || fallback;

  const main = find("bg-main", "#1e1e1e");
  const sidebar = find("bg-sidebar", "#2a2a2a");
  const card = find("bg-card", "#313131");
  const accent = find("accent", "#79c94c");
  const border = find("border-color", "#515151");

  const base = ctx.createLinearGradient(x, y, x + w, y + h);
  base.addColorStop(0, main);
  base.addColorStop(0.55, sidebar);
  base.addColorStop(1, card);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);

  const glowX = x + w * 0.42;
  const glowY = y + h * 0.45;
  const glowRadius = Math.max(w, h) * 0.6;
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
  glow.addColorStop(0, hexToRgba(accent, 0.22));
  glow.addColorStop(0.5, hexToRgba(accent, 0.07));
  glow.addColorStop(1, hexToRgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);

  const rand = seededRandom(cfg.title || "theme");
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const bw = w * (0.12 + rand() * 0.22);
    const bh = h * (0.06 + rand() * 0.18);
    const bx = x + rand() * (w - bw);
    const by = y + rand() * (h - bh);
    ctx.globalAlpha = 0.05 + rand() * 0.06;
    ctx.fillStyle = i % 2 === 0 ? accent : border;
    ctx.fillRect(bx, by, bw, bh);
  }
  for (let i = 0; i < 24; i++) {
    const sx = x + rand() * w;
    const sy = y + rand() * h;
    const size = 2 + rand() * 4;
    ctx.globalAlpha = 0.12 + rand() * 0.18;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(
    glowX, glowY, Math.max(w, h) * 0.25,
    glowX, glowY, Math.max(w, h) * 0.75
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vignette;
  ctx.fillRect(x, y, w, h);
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
    // Fall back to a deterministic gradient when no background image exists.
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
    let img;
    if (isGifFile(cfg.backgroundImage)) {
      try {
        img = loadGifFrame(cfg.backgroundImage);
      } catch {
        img = await loadImage(cfg.backgroundImage);
      }
    } else {
      img = await loadImage(cfg.backgroundImage);
    }
    const scale = Math.max(artWidth / img.width, cfg.height / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (artWidth - dw) / 2;
    const dy = (cfg.height - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  } else if (cfg.backgroundImage === "__gradient__") {
    drawFallbackBackground(ctx, 0, 0, artWidth, cfg.height, cfg);
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

const [, , arg1, ...rest] = process.argv;

if (!arg1) {
  console.error("Usage:");
  console.error("  node generate.js config.json [salida.png]");
  console.error("  node generate.js --dir src/Autor/Theme/V1");
  console.error("  node generate.js --all [src/]");
  console.error("  node generate.js --dirs src/Autor/Theme/V1 [src/Otro/Theme/V2]");
  process.exit(1);
}

if (arg1 === "--dirs") {
  // Process specific version directories
  (async () => {
    let count = 0;
    for (const dir of rest) {
      const verPath = path.resolve(dir);
      if (!fs.existsSync(verPath)) {
        console.error(`  ✗ ${dir}: not found`);
        continue;
      }
      if (!fs.existsSync(path.join(verPath, "Meta.toml")) || !fs.existsSync(path.join(verPath, "Definition.toml"))) {
        console.error(`  ✗ ${dir}: missing Meta.toml or Definition.toml`);
        continue;
      }
      try {
        await generate("--dir", verPath);
        count++;
        console.log(`  ✓ ${dir}`);
      } catch (e) {
        console.error(`  ✗ ${dir}: ${e.message}`);
      }
    }
    console.log(`Done! Generated ${count} previews.`);
  })().catch((e) => { console.error(e); process.exit(1); });
} else {
  generate(arg1, rest[0]).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
