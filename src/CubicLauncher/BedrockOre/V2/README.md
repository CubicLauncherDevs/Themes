# Bedrock Ore — CubicLauncher

## Instalación
En Configuración → Temas, usa la opción de importar y selecciona `staFF6773_BedrockOre.cbth`. Después selecciona Bedrock Ore para aplicarlo. El CBTH contiene un ZIP V2 con los archivos editables.

## Diseño
Grises neutros, botones biselados, selecciones verdes, esquinas rectas, iconos pixelados originales y fuente Pixelify Sans para títulos. No requiere descargar recursos al aplicar el tema.

## Compatibilidad y verificación
Creado según la guía y contrastado con el importador y componentes de la rama develop consultada el 6 de septiembre de 2026. Meta.toml usa campos en la raíz y Definition.toml usa [colors], [text], etc. directamente. Los ejemplos [meta] y [theme.colors] de la guía no coinciden con la deserialización de los archivos separados.

Se verificaron sintaxis TOML y CSS, rutas de recursos y contenido del paquete. No se ejecutó una sesión nativa de CubicLauncher: la apariencia final puede variar entre versiones. El CSS no modifica posición, transformaciones ni dimensiones de los controles de expandir y contraer la sidebar.

## Créditos
Inspiración visual: Minecraft Bedrock / Ore UI y Ore-UI-theme-pack de ninsent. Adaptación original para CubicLauncher; no es un port de los archivos de Prism Launcher ni un tema oficial de Mojang.

Referencia: https://github.com/ninsent/Ore-UI-theme-pack/blob/main/preview.png
Documentación: https://dev.cubiclauncher.org/docs/es-ES/guias/hacer-themes
Código contrastado: https://github.com/CubicLauncherDevs/CubicLauncher/tree/develop/src-tauri/src/commands/themes
Fuente Pixelify Sans: https://github.com/google/fonts/tree/main/ofl/pixelifysans (SIL Open Font License; copia en fonts/OFL.txt).

## Cambios en 1.1.0
- 62 entradas del registro de iconos reemplazadas por SVG originales de estilo pixelado, incluidas marcas y loaders.
- Grises neutros sin dominante azul o violeta, insignias de loaders en piedra y descargas en verde.
- Más controles cubiertos: importar temas, guardar ajustes, detectar Java, paneles y notificaciones.
- Los iconos incrustados directamente en el launcher no pasan por el registro de temas; sus trazos se ajustan donde es posible sin ocultar controles. Las imágenes de skins, mods y capturas son contenido del usuario, no iconos del tema.

## Cambios en 1.2.0
- Corregido el filtro invertido que volvía negros los iconos de la sidebar. Controles en gris claro y hover verde pálido.
- 63 archivos SVG reducidos a 52 mediante reutilización de diseños idénticos, conservando las 62 asignaciones del registro.
- Rectángulos pixelados combinados en trazados y SVG incrustados reutilizados mediante variables CSS.
- Validación estática de TOML, SVG, CSS y rutas. Sin prueba nativa del launcher.

## Cambios en 1.2.1
Se restauran los logos nativos de Modrinth (modth), CurseForge, Fabric, Forge, NeoForge y Quilt. Eliminadas sus sustituciones en el registro y en la cabecera de instancias, además de los SVG sin uso.

## Cambios en 1.3.0
- Vanilla vuelve al icono original: eliminadas la asignación custom y su reemplazo CSS.
- 36 asignaciones pasan a usar recursos originales sin modificar de Ore UI Icon Pack y Dark Amethyst. Las acciones sin equivalente mantienen los iconos compactos anteriores.
- Se preservan los colores de los PNG, sin filtros de inversión. Recursos compartidos y archivos obsoletos eliminados.
- El pack se presenta como inspirado en Minecraft Bedrock, no como una colección oficial de Mojang. Incluye créditos y licencia MIT.
- Sintaxis, referencias y empaquetado verificados; sin prueba nativa de CubicLauncher.
