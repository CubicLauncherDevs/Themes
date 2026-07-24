import { readdirSync, renameSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

let unpacked = 0;

for (const author of readdirSync(SRC, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith("."))) {
  const aPath = join(SRC, author.name);
  for (const theme of readdirSync(aPath, { withFileTypes: true }).filter(d => d.isDirectory())) {
    const tPath = join(aPath, theme.name);
    for (const ver of readdirSync(tPath, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const vPath = join(tPath, ver.name);
      
      // Find archives
      for (const f of readdirSync(vPath, { withFileTypes: true }).filter(f => f.isFile())) {
        const fp = join(vPath, f.name);
        if (!f.name.endsWith(".zip") && !f.name.endsWith(".cbth")) continue;
        
        // Create a temp extract dir
        const tmp = join(vPath, ".tmp_extract");
        if (!existsSync(tmp)) mkdirSync(tmp);
        
        try {
          execSync(`unzip -o "${fp}" -d "${tmp}" 2>/dev/null`, { stdio: "pipe" });
        } catch {
          console.error(`  ✗ failed to unzip ${f.name}`);
          try { execSync(`rm -rf "${tmp}"`, { stdio: "pipe" }); } catch {}
          continue;
        }
        
        // Move files from subfolders to vPath
        function flatten(dir) {
          for (const e of readdirSync(dir, { withFileTypes: true })) {
            const ep = join(dir, e.name);
            if (e.isDirectory()) {
              flatten(ep);
              try { execSync(`rmdir "${ep}" 2>/dev/null`, { stdio: "pipe" }); } catch {}
            } else {
              const dest = join(vPath, e.name);
              if (existsSync(dest)) unlinkSync(dest);
              renameSync(ep, dest);
            }
          }
        }
        flatten(tmp);
        try { execSync(`rm -rf "${tmp}"`, { stdio: "pipe" }); } catch {}
        
        // Remove the archive
        unlinkSync(fp);
        unpacked++;
        console.log(`  ✓ ${author.name}/${theme.name}/${ver.name} ← ${f.name}`);
      }
    }
  }
}

console.log(`\nUnpacked ${unpacked} archives`);
