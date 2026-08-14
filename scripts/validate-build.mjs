import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';
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

let buildMeta;
try {
  buildMeta = JSON.parse(await readFile(join(dist, 'build-meta.json'), 'utf8'));
  if (typeof buildMeta.commitSha !== 'string' || !/^[a-f0-9]{40}$/i.test(buildMeta.commitSha)) errors.push('build-meta.json: invalid commitSha');
  if (!Number.isFinite(Date.parse(buildMeta.generatedAt))) errors.push('build-meta.json: invalid generatedAt');
  if (![true, false, null].includes(buildMeta.sourceDirty)) errors.push('build-meta.json: invalid sourceDirty');
  for (const name of ['profile', 'links', 'projects']) {
    if (!/^[a-f0-9]{64}$/i.test(buildMeta.contentHashes?.[name] || '')) errors.push(`build-meta.json: invalid content hash for ${name}`);
    else {
      const sourcePath = fileURLToPath(new URL(`../src/data/${name}.json`, import.meta.url));
      const value = JSON.parse(await readFile(sourcePath, 'utf8'));
      const expected = createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex');
      if (buildMeta.contentHashes[name] !== expected) errors.push(`build-meta.json: stale content hash for ${name}`);
    }
  }
} catch { errors.push('build-meta.json is missing or invalid'); }

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

const homepage = await readFile(join(dist, 'index.html'), 'utf8');
const nowPage = await readFile(join(dist, 'now', 'index.html'), 'utf8');
const indexOs = await readFile(join(dist, 'index-os', 'index.html'), 'utf8');
const latest = homepage.match(/class="latest-log"[^>]*data-activity-date="([^"]+)"[^>]*data-activity-title="([^"]+)"/);
const timelineFirst = nowPage.match(/<article[^>]*data-activity-date="([^"]+)"[^>]*data-activity-title="([^"]+)"/);
const sourceCounts = nowPage.match(/class="timeline"[^>]*data-manual-count="(\d+)"[^>]*data-blog-count="(\d+)"[^>]*data-github-count="(\d+)"/);
if (!latest || !timelineFirst) errors.push('Activity feed markers are missing from homepage or /now.');
else if (latest[1] !== timelineFirst[1] || latest[2] !== timelineFirst[2]) {
  errors.push(`Homepage latest activity differs from /now: ${latest.slice(1).join(' / ')} vs ${timelineFirst.slice(1).join(' / ')}`);
}
if (!sourceCounts) errors.push('Activity source counts are missing from /now.');
else if (sourceCounts.slice(1).some(count => Number(count) < 1)) {
  errors.push(`Activity feed dropped a required source: manual/blog/github = ${sourceCounts.slice(1).join('/')}`);
}

for (const id of ['data-patterns', 'data-pattern-order', 'data-finder']) {
  const embedded = indexOs.match(new RegExp(`<script[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/script>`));
  if (!embedded) errors.push(`/index-os: missing embedded JSON #${id}`);
  else {
    try { JSON.parse(embedded[1]); }
    catch { errors.push(`/index-os: embedded JSON #${id} is invalid or was not rendered`); }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Build validation passed (${htmlFiles.length} HTML pages, ${files.length} files).`);
}
