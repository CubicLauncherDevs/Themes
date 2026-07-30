# V2

- Migración al sistema V2 de CubicLauncher (`Meta.toml` + `Definition.toml` + `Inject.css`).
- Misma paleta blanco/rosado del V1.
- Fondo nítido sin desenfoque (`image_blur = 0.0`) y opacidad completa (`image_opacity = 1.0`).
- `Inject.css` para eliminar el `brightness(0.4)` forzado del fondo y el `blur(12px)` del header de instancias.
- Fondos sólidos en dropdowns, inputs y selects para evitar transparencias inconsistentes con el tema claro.
