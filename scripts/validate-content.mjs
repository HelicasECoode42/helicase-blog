import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/content/blog/', import.meta.url));
const categories = new Set(['tech', 'daily', 'reviews']);
const required = ['title', 'date', 'category', 'summary'];
const errors = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

for (const file of await walk(root)) {
  const source = await readFile(file, 'utf8');
  const name = relative(root, file);
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) { errors.push(`${name}: missing valid frontmatter block`); continue; }
  const frontmatter = match[1];
  for (const key of required) {
    if (!new RegExp(`^${key}:\\s*\\S+`, 'm').test(frontmatter)) errors.push(`${name}: missing ${key}`);
  }
  const category = frontmatter.match(/^category:\s*([^\s#]+)/m)?.[1];
  if (category && !categories.has(category)) errors.push(`${name}: invalid category ${category}`);
  const isDraft = /^draft:\s*true\s*$/m.test(frontmatter);
  const summary = frontmatter.match(/^summary:\s*["']?(.*?)["']?\s*$/m)?.[1]?.trim();
  if (!isDraft && (!summary || summary === 'TODO')) errors.push(`${name}: public article requires a finished summary`);
  if (!match[2].trim()) errors.push(`${name}: empty article body`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Content validation passed.');
}
