import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const errors = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(dist);
const htmlFiles = files.filter(file => extname(file) === '.html');
const forbidden = [/\.helicase\//i, /studio-state\.json/i, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i, /(?:DEEPSEEK|OPENAI|ANTHROPIC)_API_KEY\s*[:=]/i, /sk-[A-Za-z0-9_-]{20,}/];

for (const file of files) {
  const source = await readFile(file, 'utf8').catch(() => null);
  if (source === null) continue;
  for (const pattern of forbidden) {
    if (pattern.test(source)) errors.push(`${file}: forbidden private marker ${pattern}`);
  }
}

async function targetExists(pathname) {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidates = clean
    ? [join(dist, clean), join(dist, clean, 'index.html')]
    : [join(dist, 'index.html')];
  for (const candidate of candidates) {
    try { if ((await stat(candidate)).isFile()) return true; } catch {}
  }
  return false;
}

for (const file of htmlFiles) {
  const source = await readFile(file, 'utf8');
  const refs = [...source.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(match => match[1]);
  for (const ref of refs) {
    if (!ref.startsWith('/') || ref.startsWith('//') || ref.startsWith('/api/') || ref.includes('{')) continue;
    const pathname = ref.split(/[?#]/, 1)[0];
    if (!pathname || await targetExists(pathname)) continue;
    errors.push(`${file}: missing internal target ${ref}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Build validation passed (${htmlFiles.length} HTML pages, ${files.length} files).`);
}
