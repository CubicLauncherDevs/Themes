# CubicLauncher Themes

Repositorio comunitario de temas personalizados para CubicLauncher.

## Estructura

```text
src/
  Author/
    Theme/
      V1/
        Author_Theme.zip
        Showcase.png
        changelog.md
      theme.md
```

Cada tema vive bajo `src/Author/Theme/` con subcarpetas versionadas (`V1`, `V2`, ...).

### Archivos por versión

| Archivo | Obligatorio | Descripción |
|---------|-------------|-------------|
| `Author_Theme.zip` | ✅ | Paquete del tema (formato `Autor_Tema.zip`) |
| `Showcase.png` | ❌ | Vista previa de la versión (case-insensitive) |
| `changelog.md` | ❌ | Cambios de esa versión |

### Archivos raíz del tema

| Archivo | Obligatorio | Descripción |
|---------|-------------|-------------|
| `theme.md` | ✅ | Markdown con la descripción y README del tema |

## ¿Cómo agregar un tema?

1. Crea `src/TuAutor/TuTema/theme.md` con la descripción.
2. Crea `src/TuAutor/TuTema/V1/`.
3. Agrega `TuAutor_TuTema.zip` (el nombre del zip debe coincidir con el patrón `Autor_Tema.zip`).
4. Opcional: agrega `Showcase.png` (puede escribirse en minúscula, se busca case-insensitive).
5. Opcional: agrega `changelog.md` con el registro de cambios de la versión.
6. Para nuevas versiones, crea `V2/`, `V3/`, etc.

### theme.md

```markdown
# Mi Tema

Descripción en markdown del tema, su inspiración, etc.
```

### changelog.md

```markdown
# V1

- Primer lanzamiento
- Tema oscuro con acentos verdes
```

## ¿Cómo funciona?

El repositorio incluye un **GitHub Action** (`.github/workflows/generate-themes.yml`) que:

1. Escanea la carpeta `src/` en cada push
2. Lee `theme.md` y `changelog.md` de cada tema
3. Obtiene las fechas de git de cada versión
4. Construye URLs hacia `raw.githubusercontent.com`
5. Genera `themes.json` en la raíz del repositorio

El archivo `themes.json` es servido estáticamente y usado por la web de CubicLauncher para mostrar y descargar temas.

## Paquetes

Los paquetes temáticos se mantienen de forma manual en `packages.json`. Cada paquete es solo una lista de temas ya existentes (por sus `id`/`slug`) para mostrarlos agrupados.

## Licencia

[CC0 1.0 Universal](LICENSE) — dominio público.
