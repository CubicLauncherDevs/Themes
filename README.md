# CubicLauncher Themes

Repositorio comunitario de temas personalizados para CubicLauncher.

## Estructura

```text
src/
  Author/
    Theme/
      V1/
        Meta.toml
        Definition.toml
        bg.png              ← imagen de fondo
        fonts/
          Font.ttf
        Showcase.png        ← opcional, screenshot del autor
        changelog.md        ← opcional
      theme.md
```

Cada tema vive bajo `src/Author/Theme/` con subcarpetas versionadas (`V1`, `V2`, ...).

> Los archivos binarios (imágenes, fuentes) se suben a Cloudflare R2 y **no se almacenan en Git**.
> El repositorio solo contiene archivos de texto (TOML, CSS, TXT, MD).

## ¿Cómo agregar un theme nuevo?

1. Creá `src/TuAutor/TuTema/theme.md` con la descripción.
2. Creá `src/TuAutor/TuTema/V1/`.
3. Agregá `Meta.toml` y `Definition.toml` (formato TOML de CubicLauncher).
4. Agregá `bg.png` (o `.jpg`, `.gif`, `.webp`) como imagen de fondo.
5. Opcional: agregá `Showcase.png`, fuentes, `changelog.md`, etc.
6. Hacé commit y push a `master`.

El CI se encarga del resto automáticamente.

## ¿Cómo agregar solo un `Showcase.png` a un theme existente?

1. Agregá `Showcase.png` a `src/Author/Theme/V1/Showcase.png`.
2. Hacé commit y push a `master`.

El workflow sube el archivo a R2, actualiza `showcaseUrl` y preserva las URLs R2
existentes de los demás assets (bg, fuentes, etc.).

> La preview se regenera automáticamente. Si `bg.png` no está en disco (ya fue subido
> a R2 en una ejecución anterior), la preview usará un gradiente como fallback.

## CI — Workflow unificado

El workflow `Generate + Assets to R2` corre en **push a master** y en **PR** cuando
se modifican archivos en `src/`:

1. **Detecta** qué directorios de versión cambiaron (ej: `src/4xnl/Jadol/V1`).
2. **Optimiza** los PNGs nuevos con `oxipng`.
3. **Genera previews** solo para los directorios modificados (`generate.js --dirs`).
4. **Mergea** collections externas a `packages.json`.
5. **Sube a R2** los assets binarios nuevos, actualiza `themes.json` con URLs de R2,
   y borra los binarios locales (`scripts/upload-assets.mjs`).
   - Descubre automáticamente themes/versiones nuevos.
   - Preserva URLs R2 de assets que ya fueron subidos en ejecuciones anteriores.
6. **Commit & push** los cambios (`[skip ci]` para evitar loops).

## Assets en R2

- Los binarios se suben a `https://themes.cubiclauncher.org/` con nombres hasheados
  (`file.<hash8>.ext`) y `Cache-Control: immutable`.
- Los archivos de texto se sirven desde GitHub raw.
- El bucket R2 tiene CORS habilitado para permitir descargas desde el frontend.

```text
Ejemplo:
  src/4xnl/Jadol/V1/bg.jpg
  → https://themes.cubiclauncher.org/src/4xnl/Jadol/V1/bg.132191b1.jpg
```

## Licencia

[CC0 1.0 Universal](LICENSE) — dominio público.
