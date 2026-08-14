import { rename, writeFile } from 'node:fs/promises';

export async function writeJsonAtomically(path, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, path);
  return content;
}
