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
        bg.png
        fonts/
          Font.ttf
        preview.png       ← generado automáticamente
        Showcase.png      ← opcional, screenshot del autor
        changelog.md      ← opcional
      theme.md
```

Cada tema vive bajo `src/Author/Theme/` con subcarpetas versionadas (`V1`, `V2`, ...).

## ¿Cómo agregar un tema?

1. Crea `src/TuAutor/TuTema/theme.md` con la descripción.
2. Crea `src/TuAutor/TuTema/V1/`.
3. Agrega `Meta.toml` y `Definition.toml` (formato TOML de CubicLauncher).
4. Agrega `bg.png` (o `.jpg`, `.gif`, `.webp`) como imagen de fondo.
5. Opcional: agrega `Showcase.png` (screenshot real del theme funcionando).
6. Opcional: agrega `changelog.md`.
7. Opcional: agrega fuentes en `fonts/` u otros assets.

> Los assets binarios (imágenes, fuentes) se migran automáticamente a Cloudflare R2
> cuando creás un Pull Request. No edites a mano las URLs de R2.

## ¿Cómo funciona?

### CI — PR a master

Cuando abrís un PR que toca `src/**`:

1. `oxipng` optimiza los PNGs
2. `generate.js` genera `preview.png` (paleta de colores)
3. `generate-themes-json.js` genera `themes.json`
4. `upload-assets.mjs` sube los binarios a Cloudflare R2 con nombres hasheados,
   convierte `files[]` a `{name, url}` y borra los binarios locales
5. Se commitea a la rama del PR

### CI — Push a master

Solo regenera `themes.json` y `preview.png` con URLs a GitHub raw
(para assets de texto como TOML/CSS).

## Licencia

[CC0 1.0 Universal](LICENSE) — dominio público.
