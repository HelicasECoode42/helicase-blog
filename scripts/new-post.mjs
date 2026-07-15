import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , category, ...titleParts] = process.argv;
const title = titleParts.join(' ').trim();
const allowed = new Set(['tech', 'daily', 'reviews']);

if (!allowed.has(category) || !title) {
  console.error('Usage: npm run new:post -- <tech|daily|reviews> "Article title"');
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const slug = title.normalize('NFKC').toLowerCase()
  .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
  .trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);
if (!slug) throw new Error('Title cannot produce a safe filename.');

const root = fileURLToPath(new URL('../src/content/blog/', import.meta.url));
const dir = join(root, category);
const file = join(dir, `${date}-${slug}.md`);
const content = `---
title: "${title.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"
date: ${date}
category: ${category}
tags: []
summary: "TODO"
draft: true
---

# ${title}

`;

await mkdir(dir, { recursive: true });
await writeFile(file, content, { encoding: 'utf8', flag: 'wx' });
console.log(file);
