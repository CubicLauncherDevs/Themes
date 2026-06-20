# CubicLauncher Themes

Repositorio comunitario de temas personalizados para [CubicLauncher](https://github.com/CubicLauncher), un launcher de Minecraft.

## ¿Qué es esto?

Este repositorio funciona como un **registro centralizado de temas visuales** creados por la comunidad. Cada tema define la apariencia completa del launcher mediante **variables CSS** que controlan colores, tipografía, sombras, bordes, filtros de iconos y más.

Los temas se distribuyen como archivos `.zip` que contienen:

- `theme.json` → Definición de todas las variables CSS del tema
- `bg.png` / `bg.jpg` → Imagen de fondo personalizada
- `Showcase.png` → Vista previa del tema
- `font.woff2` → Fuente personalizada (opcional)

## Estructura

```
src/
  Author/
    ThemeName/
      ThemeName:Author.zip
      Showcase.png
```

Cada tema se organiza bajo `src/` con el formato `Autor/NombreDelTema/`.

## ¿Cómo crear un tema?

1. Crea una carpeta `src/TuNombre/TuTema/` con un `theme.json` válido.
2. El `theme.json` debe cumplir con el [JSON Schema](theme-schema.json) y contener al menos `name` y `variables`.
3. Las variables CSS disponibles incluyen:

   - **Colores de fondo**: `--bg-main`, `--bg-sidebar`, `--bg-card`, `--bg-overlay`, `--bg-input`
   - **Colores de texto**: `--text-primary`, `--text-secondary`, `--text-muted`
   - **Colores de acento**: `--accent`, `--accent-hover`, `--accent-text`, `--accent-subtle`
   - **Semánticos**: `--color-success`, `--color-error`, `--color-warning`, `--color-info` (y sus variantes RGB)
   - **Estados de servidor**: `--color-status-starting`, `--color-status-started`, `--color-status-stopped`, `--color-status-error`
   - **Bordes y sombras**: `--border-color`, `--border-radius`, `--shadow-sm`, `--shadow-md`, `--glow-accent`
   - **Tipografía**: `--font-family`, `--font-size-base`, `--font-size-sm`, `--font-size-lg`
   - **Scrollbar**: `--scrollbar-track`, `--scrollbar-thumb`
   - **Filtros de iconos**: `--icon-filter`, `--icon-filter-error`, etc.
   - **Superposición de fondo**: `--bg-image-blur`, `--bg-image-opacity`
   - **Transiciones**: `--transition-fast`, `--transition-base`, `--transition-slow`

4. Incluye una imagen de fondo (máx. 25 MB, formatos: PNG, JPG, GIF, WEBP).
5. Incluye un `Showcase.png` como vista previa.
6. Empaqueta todo en un `.zip` con el nombre `TuTema:TuNombre.zip`.

Puedes usar la [herramienta de generación de colores](src/Notstaff/Lain%20Theme%3ANotstaff/generate_colors.py) de Lain Theme como inspiración para automatizar la creación de paletas.

## Validación

El [`theme-schema.json`](theme-schema.json) es el esquema oficial (JSON Schema draft-07) que define la estructura válida de un tema. También está disponible online para que CubicLauncher valide los temas automáticamente.

## Licencia

Este proyecto está bajo [CC0 1.0 Universal](LICENSE) — dominio público. Siéntete libre de usar, modificar y distribuir.
