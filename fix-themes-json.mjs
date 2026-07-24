import { readFileSync, writeFileSync } from "fs";

const themes = JSON.parse(readFileSync("themes.json", "utf-8"));
const R2_BASE = "https://themes.cubiclauncher.org";
const GH_BASE = "https://raw.githubusercontent.com/santiagolxx/asdasd/refs/heads/master";

// All R2 objects listed from bucket
const r2Files = [
  "src/4xnl/Colorful/V1/bg.8ec2d9a9.png",
  "src/4xnl/Colorful/V1/preview.be4066a6.png",
  "src/4xnl/Jadol/V1/Showcase.6ec35d67.png",
  "src/4xnl/Jadol/V1/bg.132191b1.jpg",
  "src/4xnl/Jadol/V1/preview.36497f1f.png",
  "src/4xnl/Kayoko/V1/NotoSansJP-VariableFont_wght.04b2ac92.ttf",
  "src/4xnl/Kayoko/V1/kayoko_bg.163c68a4.webp",
  "src/4xnl/Kayoko/V1/preview.0ee85d56.png",
  "src/CubicLauncher/Signature Amber/V1/bg.76614c3c.png",
  "src/CubicLauncher/Signature Amber/V1/preview.e494b5e6.png",
  "src/CubicLauncher/Signature Classic/V1/bg.e843246b.png",
  "src/CubicLauncher/Signature Classic/V1/preview.896fcb67.png",
  "src/CubicLauncher/Signature Dark/V1/bg.dedc4454.png",
  "src/CubicLauncher/Signature Dark/V1/preview.a2562321.png",
  "src/CubicLauncher/Signature Frost/V1/bg.4e52c8f5.png",
  "src/CubicLauncher/Signature Frost/V1/preview.a50e6262.png",
  "src/Edgajuman/Cyberpunk/V1/Audiowide.97742178.ttf",
  "src/Edgajuman/Cyberpunk/V1/bg.cb2396bc.gif",
  "src/Edgajuman/Cyberpunk/V1/preview.4881cdf7.png",
  "src/Edgajuman/Cyberpunk/V2/Audiowide.97742178.ttf",
  "src/Edgajuman/Cyberpunk/V2/bg.020e5c7e.gif",
  "src/Edgajuman/Cyberpunk/V2/preview.3f776536.png",
  "src/Edgajuman/Cyberpunk/V3/Audiowide.97742178.ttf",
  "src/Edgajuman/Cyberpunk/V3/bg.c33fcb52.gif",
  "src/Edgajuman/Cyberpunk/V3/preview.dc759bf4.png",
  "src/MPG/Waguri/V1/preview.ce023b58.png",
  "src/MPG/Waguri/V1/waguri.cc73570c.png",
  "src/MPG/ZeroTwo/V1/preview.053ae113.png",
  "src/MPG/ZeroTwo/V1/zerotwo.75713eb9.png",
  "src/Notstaff/Blur/V1/bg.6f770919.png",
  "src/Notstaff/Blur/V1/preview.9e8b6c91.png",
  "src/Notstaff/Clang/V1/bg.8f9c094b.png",
  "src/Notstaff/Clang/V1/preview.420a0c1c.png",
  "src/Notstaff/Lain Theme/V1/Syne.ee2de91f.ttf",
  "src/Notstaff/Lain Theme/V1/bg.6bb4fd66.png",
  "src/Notstaff/Lain Theme/V1/preview.c2aa71d9.png",
  "src/Notstaff/Lain Theme/V2/Syne.ee2de91f.ttf",
  "src/Notstaff/Lain Theme/V2/bg.6bb4fd66.png",
  "src/Notstaff/Lain Theme/V2/preview.d251f5c3.png",
  "src/Notstaff/Louise/V1/bg.6b43ac00.jpg",
  "src/Notstaff/Louise/V1/preview.e18f6ae9.png",
  "src/Notstaff/chill/V1/bg.364f1276.png",
  "src/Notstaff/chill/V1/preview.307efa1e.png",
  "src/Santiagolxx/Gengar/V1/Grotesk.9c2ab5aa.woff2",
  "src/Santiagolxx/Gengar/V1/bg.fd5dd9f7.jpg",
  "src/Santiagolxx/Gengar/V1/preview.0d644a76.png",
  "src/Santiagolxx/LaRoja/v1/Satoshi.93330866.otf",
  "src/Santiagolxx/LaRoja/v1/bg.7fe58b33.png",
  "src/Santiagolxx/LaRoja/v1/preview.66fd76af.png",
  "src/Santiagolxx/Lain/V1/Pixelbasel.c2771e60.ttf",
  "src/Santiagolxx/Lain/V1/bg.b290e091.jpg",
  "src/Santiagolxx/Lain/V1/preview.d144c615.png",
  "src/Santiagolxx/Lain/V2/Pixelbasel.c2771e60.ttf",
  "src/Santiagolxx/Lain/V2/bg.e18f08aa.jpg",
  "src/Santiagolxx/Lain/V2/preview.96c76de8.png",
  "src/Santiagolxx/Marron/V1/bg.fa38bdc0.jpg",
  "src/Santiagolxx/Marron/V1/preview.8806cb0d.png",
  "src/Santiagolxx/Moon/V1/bg.3d04266e.jpeg",
  "src/Santiagolxx/Moon/V1/preview.dc0f5365.png",
  "src/Santiagolxx/Rei/V1/bg.82e1680e.jpg",
  "src/Santiagolxx/Rei/V1/preview.463001a8.png",
  "src/Santiagolxx/Running/V1/bg.593bd757.gif",
  "src/Santiagolxx/Running/V1/preview.1a3d05b4.png",
  "src/Santiagolxx/WorldCupAFA/v1/Satoshi.93330866.otf",
  "src/Santiagolxx/WorldCupAFA/v1/bg.41f26327.jpeg",
  "src/Santiagolxx/WorldCupAFA/v1/preview.bc39a4cd.png",
  "src/Unr4n/Dark Theme/V1/bg.99e80a87.jpg",
  "src/Unr4n/Dark Theme/V1/preview.af433be6.png",
];

function origName(r2Key) {
  return r2Key.substring(r2Key.lastIndexOf("/") + 1).replace(/\.([a-f0-9]{8})\./, ".");
}

// Build a map: vDir -> { fileKey: origName }
const r2ByDir = {};
for (const f of r2Files) {
  const dir = f.substring(0, f.lastIndexOf("/"));
  if (!r2ByDir[dir]) r2ByDir[dir] = [];
  r2ByDir[dir].push({ key: f, name: origName(f) });
}

for (const theme of themes) {
  for (const version of theme.versions) {
    const vDir = `${theme.dirPath}/${version.version}`.replace(/\\/g, "/");
    const r2Entries = r2ByDir[vDir] || [];

    const newFiles = [];
    for (const origFile of version.files) {
      const fname = typeof origFile === "string" ? origFile : origFile.name;
      const r2Match = r2Entries.find((e) => e.name === fname);
      if (r2Match) {
        newFiles.push({ name: fname, url: `${R2_BASE}/${r2Match.key}` });
      } else {
        newFiles.push({ name: fname, url: `${GH_BASE}/${vDir}/${fname}` });
      }
    }

    // Add binary files not in original files[] (exclude preview/showcase — those are display-only)
    const EXCLUDE = new Set(["preview.png", "Showcase.png"]);
    for (const r2e of r2Entries) {
      if (EXCLUDE.has(r2e.name)) continue;
      const already = newFiles.some((f) => f.name === r2e.name);
      if (!already) {
        newFiles.push({ name: r2e.name, url: `${R2_BASE}/${r2e.key}` });
      }
    }

    version.files = newFiles;

    // Update previewUrl
    const r2Preview = r2Entries.find((e) => e.name === "preview.png");
    if (r2Preview) {
      version.previewUrl = `${R2_BASE}/${r2Preview.key}`;
    }

    // Update showcaseUrl
    const r2Showcase = r2Entries.find((e) => e.name === "Showcase.png");
    if (r2Showcase) {
      version.showcaseUrl = `${R2_BASE}/${r2Showcase.key}`;
    }
  }

  // Sync theme previewUrl from latest version
  const latest = theme.versions[0];
  if (latest && latest.previewUrl) {
    theme.previewUrl = latest.previewUrl;
  }
}

writeFileSync("themes.json", JSON.stringify(themes, null, 2), "utf-8");
console.log("Done");
