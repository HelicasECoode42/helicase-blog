import { rename, writeFile } from 'node:fs/promises';

// Vite can observe a file while it is being saved. Generate page-facing modules
// through a temporary file + rename so a build always reads a complete snapshot.
export async function writePublicModule(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `export default ${JSON.stringify(value, null, 2)};\n`, 'utf8');
  await rename(temporary, path);
}
