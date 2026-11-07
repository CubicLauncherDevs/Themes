# AGENTS.md — CubicLauncher Themes

Guía para agentes/colaboradores que editan este repositorio. Repo de temas
comunitarios para CubicLauncher (`src/Autor/Tema/Vn/`). Léelo antes de crear o
arreglar un tema.

## Regla crítica: formato de `Definition.toml`

Las secciones van **en la raíz, SIN el prefijo `theme.`**. El launcher
deserializa `Definition.toml` directamente en el struct `ThemeDef`
(Rust/serde), cuyos campos son `colors`, `background`, `text`, `fonts`, `icons`,
`layout`, `borders`, `shadows`, `backgrounds`, `backdrop`, `others`.

- ✅ Correcto: `[background]`, `[colors]`, `[backgrounds]`, `[text]`, `[borders]`,
  `[layout]`, `[shadows]`, `[backdrop]`, `[others]`, `[[fonts]]`, `[icons]`.
- ❌ Incorrecto: `[theme.colors]`, `[[theme.fonts]]`, `[theme.background]`, etc.

**Por qué importa:** todos los campos de `ThemeDef` tienen `#[serde(default)]`.
Si el TOML usa `[theme.*]`, serde ve un único campo desconocido `theme`, lo
ignora y deja **todos los campos por defecto**. Resultado: el tema **se importa
pero no aplica nada y no lanza ningún error** (síntoma clásico de este bug).

> La guía oficial (`dev.cubiclauncher.org/docs/es-ES/guias/crear-tema`) muestra
> ejemplos con `[theme.*]` y `[meta]`, pero **no coinciden** con la deserialización
> real de los archivos separados. La fuente de verdad es el código:
> `CubicLauncherDevs/CubicLauncher` → `src-tauri/src/commands/themes/v2.rs`
> (`ThemeDef` / `ThemeMeta` / `flatten_variables`).

### Mapeo sección → variable CSS (`flatten_variables`)

| Sección | Clave | Variable |
|---------|-------|----------|
| `colors` | `accent` | `--accent` |
| `colors` | `bg-item-active` | `--bg-item-active` |
| `backgrounds` | `main` / `sidebar` / `card` | `--bg-main` / `--bg-sidebar` / `--bg-card` |
| `text` | `primary` | `--text-primary` |
| `borders` | `color` / `radius` | `--border-color` / `--border-radius` |
| `layout` | `sidebar-width` | `--sidebar-width` |
| `shadows` | `glow-accent` | `--glow-accent` |
| `backdrop` | `modal = 8.0` | `--backdrop-blur-modal: 8px` |
| `others` | `font-family` | `--font-family` |

Claves duplicadas entre secciones generan colisión y se sobrescriben (con warning).

### Convención del repo

- `main`, `sidebar`, `card`, `input`, `surface` → en `[backgrounds]`.
- `bg-item-active`, `bg-overlay` → dentro de `[colors]`.
- `[background]` no genera variables CSS: expone el fondo del tema
  (`reference_path`, `image_blur`, `image_opacity`).
- `Meta.toml` va con campos **en la raíz** (`name`, `author`, `version`,
  `description`, `injects_css`, `format`, `extends`), no bajo `[meta]`.

### Herencia (`extends`)

- `extends` va en la raíz de `Meta.toml` y usa el **ID instalado** de la base:
  minúsculas, espacios reemplazados por `_`, formato `nombre_autor`
  (`Signature Dark` + `CubicLauncher` → `signature_dark_cubiclauncher`).
- Se acepta el prefijo `user:` y se descarta.
- La base debe existir en `src/` como tema V2 (`Meta.toml` + `Definition.toml`).
- El hijo gana clave a clave. No se heredan `fonts`, `icons`, `inject`,
  `layout_pack` ni `background.reference_path`.
- Máximo 8 niveles de profundidad; un ciclo es error.
- Un tema con `extends` puede omitir `bg.*`; el preview usará gradiente.
- `themes.json` publica `extends` y `extendsTheme` (slug de la base) solo cuando
  hay herencia.

## Checklist al crear/arreglar un tema

1. `src/Autor/Tema/theme.md` con la descripción.
2. `src/Autor/Tema/V1/` con `Meta.toml`, `Definition.toml` y un `bg.png|jpg|gif|webp`
   (opcional si el tema usa `extends`).
3. Verificá que **no exista ningún `[theme.`** en `Definition.toml`.
4. Validá que el TOML parsee (p. ej. `python3 -c "import tomllib; tomllib.load(open('Definition.toml','rb'))"`).
5. Si el tema incluye `Inject.css`, `injects_css = true` en `Meta.toml`.
6. Si usa `extends`, verificá que el ID de la base exista en `src/`, que no haya
   ciclos y que la cadena no supere 8 niveles.

## Validación y CI

- `scripts/validate-pr.mjs` exige `Meta.toml`, `Definition.toml` y una imagen de
  fondo (`bg.png|jpg|jpeg|gif|webp`) en versiones nuevas, salvo que el tema use
  `extends`; una versión que ya existía en la base puede actualizarse sin volver
  a subir el fondo. Si hay carpeta `fonts/`, debe tener al menos una fuente
  válida. También valida que la base exista, sea V2 y que no haya ciclos ni más
  de 8 niveles, incluso en hijos que no cambiaron en el PR.
- El CI (`.github/workflows`) detecta versiones cambiadas, genera previews con
  `generate.js --dirs`, sube binarios a R2 y actualiza `themes.json`.
- Los binarios **no se commitean** (van a R2); el repo solo tiene texto.
