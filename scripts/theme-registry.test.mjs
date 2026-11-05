import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildThemeRegistry,
  computeInstalledId,
  getDependentVersionDirs,
  mergeDefinitions,
  normalizeExtends,
  resolveInheritance,
} from "./theme-registry.mjs";

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cubic-themes-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, "src");
}

function writeTheme(src, author, theme, version, meta, definition) {
  const dir = path.join(src, author, theme, version);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "Meta.toml"), meta);
  fs.writeFileSync(path.join(dir, "Definition.toml"), definition);
  return dir;
}

test("calcula identificadores y normaliza extends", () => {
  assert.equal(
    computeInstalledId("Signature Dark", "CubicLauncher"),
    "signature_dark_cubiclauncher"
  );
  assert.equal(computeInstalledId("Solo", ""), "solo");
  assert.equal(normalizeExtends(" user:base_author "), "base_author");
  assert.equal(normalizeExtends("   "), null);
});

test("aplica la semántica de merge del launcher", () => {
  const merged = mergeDefinitions(
    {
      colors: { accent: "#111111", text: "#eeeeee" },
      backgrounds: { main: "#000000" },
      typography: { family: "Base", size_base: "12px" },
      background: { reference_path: "base.png", image_blur: "2px", mode: "cover" },
      fonts: [{ family: "Base" }],
      icons: { preview: "base.svg" },
    },
    {
      colors: { accent: "#222222" },
      typography: { size_base: "14px" },
      background: { reference_path: "child.png" },
      fonts: [{ family: "Child" }],
      icons: { preview: "child.svg" },
    }
  );

  assert.equal(merged.colors.accent, "#222222");
  assert.equal(merged.colors.text, "#eeeeee");
  assert.equal(merged.backgrounds.main, "#000000");
  assert.equal(merged.typography.family, "Base");
  assert.equal(merged.typography.size_base, "14px");
  assert.equal(merged.background.reference_path, "child.png");
  assert.equal(merged.background.image_blur, "2px");
  assert.equal(merged.background.mode, "cover");
  assert.deepEqual(merged.fonts, [{ family: "Child" }]);
  assert.deepEqual(merged.icons, { preview: "child.svg" });
});

test("resuelve una base V2 y expone el catálogo", (t) => {
  const src = createFixture(t);
  writeTheme(
    src,
    "CubicLauncher",
    "Signature_Dark",
    "V1",
    'name = "Signature Dark"\nauthor = "CubicLauncher"\nversion = "1.0.0"\n',
    '[colors]\naccent = "#111111"\n[backgrounds]\nmain = "#000000"\n'
  );
  const childDir = writeTheme(
    src,
    "Notstaff",
    "Petal_V2",
    "V1",
    'name = "Petal V2"\nauthor = "Notstaff"\nversion = "1.0.0"\nformat = 2\nextends = "user:signature_dark_cubiclauncher"\n',
    '[colors]\naccent = "#222222"\n'
  );

  const registry = buildThemeRegistry(src);
  assert.equal(registry.byCatalogId.get("cubiclauncher-signature-dark").latest.installedId, "signature_dark_cubiclauncher");
  assert.equal(registry.byCatalogId.get("notstaff-petal-v2").latest.installedId, "petal_v2_notstaff");

  const { definition, chain } = resolveInheritance(childDir, registry);
  assert.equal(definition.colors.accent, "#222222");
  assert.equal(definition.backgrounds.main, "#000000");
  assert.deepEqual(
    chain.map((entry) => entry.id),
    ["petal_v2_notstaff", "signature_dark_cubiclauncher"]
  );
});

test("detecta bases inexistentes y ciclos", (t) => {
  const src = createFixture(t);
  const missingDir = writeTheme(
    src,
    "A",
    "Missing",
    "V1",
    'name = "Missing"\nauthor = "A"\nextends = "no_existe"\n',
    "[colors]\n"
  );
  let registry = buildThemeRegistry(src);
  assert.throws(() => resolveInheritance(missingDir, registry), /no está instalado/);

  writeTheme(
    src,
    "A",
    "Ciclo_A",
    "V1",
    'name = "Ciclo A"\nauthor = "A"\nextends = "ciclo_b_a"\n',
    "[colors]\n"
  );
  const cycleBDir = writeTheme(
    src,
    "B",
    "Ciclo_B",
    "V1",
    'name = "Ciclo B"\nauthor = "A"\nextends = "ciclo_a_a"\n',
    "[colors]\n"
  );
  registry = buildThemeRegistry(src);
  assert.throws(() => resolveInheritance(cycleBDir, registry), /Ciclo de herencia/);
});

test("rechaza cadenas de más de 8 niveles", (t) => {
  const src = createFixture(t);
  let previous = null;
  for (let index = 0; index <= 9; index++) {
    const extendsLine = previous ? `extends = "${previous}"\n` : "";
    previous = `t${index}_x`;
    writeTheme(
      src,
      "X",
      `T${index}`,
      "V1",
      `name = "T${index}"\nauthor = "X"\n${extendsLine}`,
      "[colors]\n"
    );
  }

  const registry = buildThemeRegistry(src);
  const deepest = path.join(src, "X", "T9", "V1");
  assert.throws(() => resolveInheritance(deepest, registry), /demasiado profunda/);
});

test("expande previews a los temas dependientes", (t) => {
  const src = createFixture(t);
  writeTheme(
    src,
    "Base",
    "Tema",
    "V1",
    'name = "Tema"\nauthor = "Base"\n',
    "[colors]\n"
  );
  writeTheme(
    src,
    "Child",
    "Tema",
    "V1",
    'name = "Tema"\nauthor = "Child"\nextends = "tema_base"\n',
    "[colors]\n"
  );

  const registry = buildThemeRegistry(src);
  const expanded = getDependentVersionDirs(["src/Base/Tema/V1"], registry);

  assert.ok(expanded.includes("src/Base/Tema/V1"));
  assert.ok(expanded.includes("src/Child/Tema/V1"));
});
