import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

function parseVersion(v) {
  // Try to extract version from "v1", "V1", "v2", "V2" etc.
  const m = v.match(/[vV]?(\d+(?:\.\d+)?)/);
  return m ? m[1] : "1.0";
}

for (const author of readdirSync(SRC, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith("."))) {
  const aPath = join(SRC, author.name);
  for (const theme of readdirSync(aPath, { withFileTypes: true }).filter(d => d.isDirectory())) {
    const tPath = join(aPath, theme.name);
    for (const ver of readdirSync(tPath, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const vPath = join(tPath, ver.name);
      const jsonPath = join(vPath, "theme.json");
      const metaPath = join(vPath, "Meta.toml");
      const defPath = join(vPath, "Definition.toml");
      
      if (!existsSync(jsonPath)) continue;
      if (existsSync(metaPath) && existsSync(defPath)) {
        // Already has TOML, remove theme.json
        unlinkSync(jsonPath);
        console.log(`  ✓ ${author.name}/${theme.name}/${ver.name}: already TOML, removed theme.json`);
        continue;
      }
      
      try {
        const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
        const vars = data.variables || {};
        
        // Meta.toml
        const meta = `name = "${data.name || theme.name}"
author = "${data.author || author.name}"
version = "${parseVersion(ver.name)}"
description = "${data.description || ""}"
tags = []
date = ""
`;
        writeFileSync(metaPath, meta);
        
        // Definition.toml
        const defLines = [];
        defLines.push("[colors]");
        for (const [key, val] of Object.entries(vars)) {
          if (key.startsWith("--color-")) {
            const name = key.replace("--color-", "");
            defLines.push(`${name} = "${val}"`);
          }
        }
        // accent
        if (vars["--accent"]) defLines.push(`accent = "${vars["--accent"]}"`);
        if (vars["--accent-hover"]) defLines.push(`accent-hover = "${vars["--accent-hover"]}"`);
        if (vars["--accent-active"]) defLines.push(`accent-active = "${vars["--accent-active"]}"`);
        
        defLines.push("");
        defLines.push("[backgrounds]");
        if (vars["--bg-main"]) defLines.push(`main = "${vars["--bg-main"]}"`);
        if (vars["--bg-sidebar"]) defLines.push(`sidebar = "${vars["--bg-sidebar"]}"`);
        if (vars["--bg-card"]) defLines.push(`card = "${vars["--bg-card"]}"`);
        if (vars["--bg-item-active"]) defLines.push(`item-active = "${vars["--bg-item-active"]}"`);
        if (vars["--bg-overlay"]) defLines.push(`overlay = "${vars["--bg-overlay"]}"`);
        if (vars["--bg-input"]) defLines.push(`input = "${vars["--bg-input"]}"`);
        
        defLines.push("");
        defLines.push("[text]");
        if (vars["--text-primary"]) defLines.push(`primary = "${vars["--text-primary"]}"`);
        if (vars["--text-secondary"]) defLines.push(`secondary = "${vars["--text-secondary"]}"`);
        if (vars["--text-muted"]) defLines.push(`muted = "${vars["--text-muted"]}"`);
        if (vars["--text-accent"]) defLines.push(`accent = "${vars["--text-accent"]}"`);
        
        defLines.push("");
        defLines.push("[borders]");
        if (vars["--border-color"]) defLines.push(`color = "${vars["--border-color"]}"`);
        if (vars["--border-color-hover"]) defLines.push(`color-hover = "${vars["--border-color-hover"]}"`);
        
        defLines.push("");
        defLines.push("[layout]");
        if (vars["--border-radius"]) defLines.push(`border-radius = "${vars["--border-radius"]}"`);
        
        defLines.push("");
        defLines.push("[fonts]");
        // Find font files in the directory
        for (const f of readdirSync(vPath)) {
          if (/\.(ttf|otf|woff2?|eot)$/i.test(f)) {
            defLines.push(`family-${f.replace(/\.[^.]+$/, "")} = "${f}"`);
          }
        }
        
        defLines.push("");
        defLines.push("[background]");
        if (data.bg_image) {
          defLines.push(`reference_path = "${data.bg_image}"`);
        }
        if (data.bg_image_blur) defLines.push(`blur = "${data.bg_image_blur}"`);
        if (data.bg_image_opacity !== undefined) defLines.push(`opacity = "${data.bg_image_opacity}"`);
        
        writeFileSync(defPath, defLines.join("\n"));
        
        // Remove theme.json
        unlinkSync(jsonPath);
        console.log(`  ✓ ${author.name}/${theme.name}/${ver.name}: converted`);
      } catch (e) {
        console.error(`  ✗ ${author.name}/${theme.name}/${ver.name}: ${e.message}`);
      }
    }
  }
}

console.log("\nDone");
