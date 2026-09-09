import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseRef = process.env.BASE_REF || 'origin/master';
const resultFile = process.env.RESULT_FILE || 'validation-result.txt';
const messageFile = process.env.MESSAGE_FILE || 'validation-message.md';
const guideUrl = 'https://dev.cubiclauncher.org/docs/es-ES/guias/hacer-themes';

const errors = [];

function findAffectedVersionDirs() {
  let output;
  try {
    output = execSync(`git diff --name-only ${baseRef}...HEAD -- src/`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    // Retry without the merge-base syntax if the base ref is not available
    output = execSync(`git diff --name-only ${baseRef} HEAD -- src/`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  const files = output.split('\n').filter(Boolean);
  const dirs = new Set();

  for (const file of files) {
    // Expected pattern: src/Author/Theme/V1/...
    const parts = file.split('/');
    if (parts.length >= 4) {
      const versionDir = parts.slice(0, 4).join('/');
      dirs.add(versionDir);
    }
  }

  return Array.from(dirs).sort();
}

function validateVersionDir(versionDir) {
  const localErrors = [];

  if (!fs.existsSync(versionDir)) {
    localErrors.push(`El directorio afectado no existe en el PR: \`${versionDir}\`.`);
    return localErrors;
  }

  const metaPath = path.join(versionDir, 'Meta.toml');
  const defPath = path.join(versionDir, 'Definition.toml');

  if (!fs.existsSync(metaPath)) {
    localErrors.push(`Falta \`${path.join(versionDir, 'Meta.toml')}\`.`);
  }

  if (!fs.existsSync(defPath)) {
    localErrors.push(`Falta \`${path.join(versionDir, 'Definition.toml')}\`.`);
  }

  const bgNames = ['bg.png', 'bg.jpg', 'bg.jpeg', 'bg.gif', 'bg.webp'];
  const hasBg = bgNames.some((name) => fs.existsSync(path.join(versionDir, name)));
  if (!hasBg) {
    localErrors.push(
      `Falta imagen de fondo en \`${versionDir}\`. Se espera uno de: ${bgNames.map((n) => `\`${n}\``).join(', ')}.`
    );
  }

  const themeDir = path.dirname(versionDir); // src/Author/Theme
  const themeMdPath = path.join(themeDir, 'theme.md');
  if (!fs.existsSync(themeMdPath)) {
    localErrors.push(`Falta \`${path.join(themeDir, 'theme.md')}\`.`);
  }

  return localErrors;
}

const versionDirs = findAffectedVersionDirs();

if (versionDirs.length === 0) {
  errors.push('No se detectaron cambios en directorios de versión bajo `src/`.');
}

for (const dir of versionDirs) {
  errors.push(...validateVersionDir(dir));
}

if (errors.length > 0) {
  const body = [
    '❌ Tu PR no cumple con la estructura esperada. Revisá los siguientes errores:',
    '',
    ...errors.map((e) => `- ${e}`),
    '',
    `📚 Podés consultar la [guía oficial para hacer themes](${guideUrl}) para más detalles.`,
  ].join('\n');

  fs.writeFileSync(resultFile, 'false');
  fs.writeFileSync(messageFile, body);

  console.log('VALIDATION_FAILED');
  for (const error of errors) {
    console.log(`- ${error}`);
  }

  process.exit(1);
} else {
  const versionList = versionDirs.map((d) => `- \`${d}\``).join('\n');
  const body = [
    '✅ Tu tema cumple con la estructura requerida.',
    '',
    'Directorios verificados:',
    versionList,
    '',
    '🕐 Tu tema está en **lista de espera**. Pronto algún colaborador de la comunidad lo revisará.',
    '',
    `📚 Mientras tanto, podés revisar la [guía oficial para hacer themes](${guideUrl}).`,
  ].join('\n');

  fs.writeFileSync(resultFile, 'true');
  fs.writeFileSync(messageFile, body);

  console.log('VALIDATION_PASSED');
  for (const dir of versionDirs) {
    console.log(`- ${dir}`);
  }

  process.exit(0);
}
