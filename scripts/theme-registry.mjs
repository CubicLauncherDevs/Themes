import fs from "node:fs";
import path from "node:path";

export const MAX_EXTENDS_DEPTH = 8;

const KNOWN_TYPOGRAPHY_FIELDS = new Set([
  "family",
  "size_base",
  "size_sm",
  "size_lg",
  "size_control",
  "size_label",
  "weight_normal",
  "weight_medium",
  "weight_bold",
  "line_height",
]);

const KNOWN_BACKGROUND_FIELDS = new Set([
  "reference_path",
  "image_blur",
  "image_opacity",
  "mode",
  "position",
  "brightness",
]);

const INHERITED_SECTIONS = [
  "colors",
  "text",
  "borders",
  "layout",
  "shadows",
  "backgrounds",
  "backdrop",
  "others",
  "tokens",
  "spacing",
  "motion",
];

const KNOWN_THEME_FIELDS = new Set([
  ...INHERITED_SECTIONS,
  "background",
  "fonts",
  "icons",
  "typography",
  "components",
  "inject",
  "layout_pack",
]);

function stripInlineComment(line) {
  let doubleQuote = false;
  let singleQuote = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !singleQuote) doubleQuote = !doubleQuote;
    else if (char === "'" && !doubleQuote) singleQuote = !singleQuote;
    else if (char === "#" && !doubleQuote && !singleQuote) return line.slice(0, i);
  }
  return line;
}

export function parseToml(text) {
  const result = {};
  let section = result;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;

    const arrayTable = line.match(/^\[\[(.+)\]\]$/);
    if (arrayTable) {
      const key = arrayTable[1].trim();
      if (!Array.isArray(result[key])) result[key] = [];
      section = {};
      result[key].push(section);
      continue;
    }

    const table = line.match(/^\[(.+)\]$/);
    if (table) {
      let node = result;
      for (const part of table[1].split(".").map((value) => value.trim())) {
        if (!node[part] || typeof node[part] !== "object" || Array.isArray(node[part])) {
          node[part] = {};
        }
        node = node[part];
      }
      section = node;
      continue;
    }

    const equals = line.indexOf("=");
    if (equals === -1) continue;

    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    section[key] = value;
  }

  return result;
}

export function readTomlFile(filePath) {
  return parseToml(fs.readFileSync(filePath, "utf8"));
}

export function computeInstalledId(name, author) {
  const normalizedName = String(name ?? "").toLowerCase().replace(/ /g, "_");
  const normalizedAuthor = String(author ?? "").toLowerCase().replace(/ /g, "_");
  return normalizedAuthor ? `${normalizedName}_${normalizedAuthor}` : normalizedName;
}

export function normalizeExtends(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("user:") ? trimmed.slice(5) : trimmed;
}

export function validateIdentifier(id) {
  if (!id || id.length > 64) {
    return "El identificador no puede estar vacío ni superar 64 caracteres.";
  }
  if (id === "." || id === ".." || id.includes(":") || id.includes("\0")) {
    return "El identificador contiene caracteres no permitidos.";
  }
  if (id.includes("/") || id.includes("\\")) {
    return "El identificador no puede contener separadores de ruta.";
  }
  return null;
}

function compareNatural(a, b) {
  const pattern = /(\d+)|(\D+)/g;
  const aParts = String(a).match(pattern) || [];
  const bParts = String(b).match(pattern) || [];
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i++) {
    const aPart = aParts[i] || "";
    const bPart = bParts[i] || "";
    const aNumber = Number.parseInt(aPart, 10);
    const bNumber = Number.parseInt(bPart, 10);
    if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber)) {
      if (aNumber !== bNumber) return aNumber - bNumber;
    } else {
      const comparison = aPart.localeCompare(bPart);
      if (comparison !== 0) return comparison;
    }
  }

  return 0;
}

function catalogIdFor(author, name) {
  return `${author}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function versionDirsFor(themePath) {
  return fs
    .readdirSync(themePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(themePath, entry.name))
    .filter(
      (versionDir) =>
        fs.existsSync(path.join(versionDir, "Meta.toml")) &&
        fs.existsSync(path.join(versionDir, "Definition.toml"))
    );
}

export function buildThemeRegistry(srcDir) {
  const absoluteSrc = path.resolve(srcDir);
  const repoRoot = path.dirname(absoluteSrc);
  const themes = [];
  const byInstalledId = new Map();
  const byCatalogId = new Map();

  for (const authorEntry of fs.readdirSync(absoluteSrc, { withFileTypes: true })) {
    if (!authorEntry.isDirectory() || authorEntry.name.startsWith(".")) continue;
    const authorPath = path.join(absoluteSrc, authorEntry.name);

    for (const themeEntry of fs.readdirSync(authorPath, { withFileTypes: true })) {
      if (!themeEntry.isDirectory() || themeEntry.name.startsWith(".")) continue;
      const themePath = path.join(authorPath, themeEntry.name);
      const versionDirs = versionDirsFor(themePath);
      if (versionDirs.length === 0) continue;

      const versions = versionDirs
        .map((versionDir) => {
          const meta = readTomlFile(path.join(versionDir, "Meta.toml"));
          return {
            version: path.basename(versionDir),
            dirPath: versionDir,
            relativeDir: path.relative(repoRoot, versionDir).split(path.sep).join("/"),
            meta,
            installedId: computeInstalledId(meta.name, meta.author),
          };
        })
        .sort((a, b) => compareNatural(a.version, b.version));

      const theme = {
        catalogId: catalogIdFor(authorEntry.name, themeEntry.name),
        authorDir: authorEntry.name,
        folderName: themeEntry.name,
        dirPath: themePath,
        relativeDir: path.relative(repoRoot, themePath).split(path.sep).join("/"),
        versions,
        latest: versions[versions.length - 1],
      };

      themes.push(theme);
      byCatalogId.set(theme.catalogId, theme);

      for (const version of versions) {
        if (!version.installedId) continue;
        const refs = byInstalledId.get(version.installedId) || [];
        refs.push({ theme, version });
        byInstalledId.set(version.installedId, refs);
      }
    }
  }

  return { srcDir: absoluteSrc, repoRoot, themes, byInstalledId, byCatalogId };
}

export function findBase(registry, installedId) {
  const refs = registry.byInstalledId.get(installedId) || [];
  if (refs.length === 0) return { status: "missing", refs: [] };

  const themesById = new Map(refs.map((ref) => [ref.theme.catalogId, ref.theme]));
  if (themesById.size > 1) {
    return { status: "ambiguous", refs, themes: [...themesById.values()] };
  }

  const sorted = [...refs].sort((a, b) => compareNatural(b.version.version, a.version.version));
  return { status: "ok", refs, theme: sorted[0].theme, version: sorted[0].version };
}

function extendSection(base, child, key) {
  return { ...(base[key] || {}), ...(child[key] || {}) };
}

function mergeTypography(baseTypography = {}, childTypography = {}) {
  const merged = {};

  for (const field of KNOWN_TYPOGRAPHY_FIELDS) {
    if (childTypography[field] !== undefined) merged[field] = childTypography[field];
    else if (baseTypography[field] !== undefined) merged[field] = baseTypography[field];
  }

  for (const [key, value] of Object.entries(childTypography)) {
    if (!KNOWN_TYPOGRAPHY_FIELDS.has(key)) merged[key] = value;
  }

  return merged;
}

function mergeBackground(baseBackground = {}, childBackground = {}) {
  const merged = {};

  for (const field of KNOWN_BACKGROUND_FIELDS) {
    if (field === "reference_path") {
      if (childBackground[field] !== undefined) merged[field] = childBackground[field];
    } else if (childBackground[field] !== undefined) {
      merged[field] = childBackground[field];
    } else if (baseBackground[field] !== undefined) {
      merged[field] = baseBackground[field];
    }
  }

  for (const [key, value] of Object.entries(childBackground)) {
    if (!KNOWN_BACKGROUND_FIELDS.has(key)) merged[key] = value;
  }

  return merged;
}

export function mergeDefinitions(base, child) {
  const merged = {};

  for (const section of INHERITED_SECTIONS) {
    merged[section] = extendSection(base, child, section);
  }

  merged.components = { ...(base.components || {}) };
  for (const [component, entries] of Object.entries(child.components || {})) {
    merged.components[component] = {
      ...(merged.components[component] || {}),
      ...entries,
    };
  }

  merged.typography = mergeTypography(base.typography, child.typography);
  merged.background = mergeBackground(base.background, child.background);

  for (const section of ["fonts", "icons", "inject", "layout_pack"]) {
    if (child[section] !== undefined) merged[section] = child[section];
  }

  for (const [key, value] of Object.entries(child)) {
    if (!KNOWN_THEME_FIELDS.has(key)) merged[key] = value;
  }

  return merged;
}

function resolveAt(versionDir, registry, chain, depth) {
  const meta = readTomlFile(path.join(versionDir, "Meta.toml"));
  const id = computeInstalledId(meta.name, meta.author);
  const chainKey = id || versionDir;

  if (depth > MAX_EXTENDS_DEPTH) {
    throw new Error(
      `Herencia demasiado profunda: '${[...chain.map((entry) => entry.id), chainKey].join(" -> ")}' supera el máximo de ${MAX_EXTENDS_DEPTH} niveles.`
    );
  }
  if (chain.some((entry) => entry.id === chainKey)) {
    throw new Error(
      `Ciclo de herencia: ${[...chain.map((entry) => entry.id), chainKey].join(" -> ")}.`
    );
  }

  chain.push({ id: chainKey, versionDir, meta });

  const definition = readTomlFile(path.join(versionDir, "Definition.toml"));
  const baseId = normalizeExtends(meta.extends);
  if (!baseId) return definition;

  const identifierError = validateIdentifier(baseId);
  if (identifierError) {
    throw new Error(`'extends' inválido: ${identifierError}`);
  }

  const base = findBase(registry, baseId);
  if (base.status === "missing") {
    throw new Error(`El tema base '${baseId}' no está instalado o no es V2.`);
  }
  if (base.status === "ambiguous") {
    throw new Error(
      `El tema base '${baseId}' es ambiguo; coincide con: ${base.themes.map((theme) => theme.catalogId).join(", ")}.`
    );
  }

  const baseDefinition = resolveAt(base.version.dirPath, registry, chain, depth + 1);
  return mergeDefinitions(baseDefinition, definition);
}

export function resolveInheritance(versionDir, registry) {
  const chain = [];
  const definition = resolveAt(path.resolve(versionDir), registry, chain, 0);
  return { definition, chain, entries: chain };
}

export function getDependentVersionDirs(changedDirs, registry) {
  const normalizedChanged = new Set(
    changedDirs.map((dir) => path.resolve(registry.repoRoot, dir))
  );
  const changedIds = new Set();

  for (const refs of registry.byInstalledId.values()) {
    for (const ref of refs) {
      if (normalizedChanged.has(path.resolve(ref.version.dirPath))) {
        changedIds.add(ref.version.installedId);
      }
    }
  }

  if (changedIds.size === 0) return [...changedDirs];

  const result = new Set(changedDirs);
  for (const theme of registry.themes) {
    for (const version of theme.versions) {
      if (normalizedChanged.has(path.resolve(version.dirPath))) continue;
      let entries;
      try {
        entries = resolveInheritance(version.dirPath, registry).entries;
      } catch {
        continue;
      }
      if (entries.some((entry) => changedIds.has(entry.id))) {
        result.add(version.relativeDir);
      }
    }
  }

  return [...result];
}
