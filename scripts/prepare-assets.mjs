import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomically } from './public-data.mjs';

const vendorDir = fileURLToPath(new URL('../public/vendor/', import.meta.url));
const threeSource = fileURLToPath(new URL('../node_modules/three/build/three.module.min.js', import.meta.url));
const threeTarget = fileURLToPath(new URL('../public/vendor/three.module.min.js', import.meta.url));
const buildMetaTarget = fileURLToPath(new URL('../public/build-meta.json', import.meta.url));
const execFileAsync = promisify(execFile);
const publicSources = {
  profile: fileURLToPath(new URL('../src/data/profile.json', import.meta.url)),
  links: fileURLToPath(new URL('../src/data/links.json', import.meta.url)),
  projects: fileURLToPath(new URL('../src/data/projects.json', import.meta.url)),
};

await mkdir(vendorDir, { recursive: true });
await copyFile(threeSource, threeTarget);
let commitSha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA || '';
if (!commitSha) {
  try { commitSha = (await execFileAsync('git', ['rev-parse', 'HEAD'])).stdout.trim(); } catch {}
}
let sourceDirty = null;
try { sourceDirty = Boolean((await execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'])).stdout.trim()); } catch {}
const contentHashes = {};
for (const [name, source] of Object.entries(publicSources)) {
  const value = JSON.parse(await readFile(source, 'utf8'));
  const canonical = `${JSON.stringify(value, null, 2)}\n`;
  contentHashes[name] = createHash('sha256').update(canonical).digest('hex');
}
await writeJsonAtomically(buildMetaTarget, {
  commitSha,
  generatedAt: new Date().toISOString(),
  sourceDirty,
  contentHashes,
});
console.log(`Prepared self-hosted browser assets and build metadata (${commitSha.slice(0, 12) || 'unknown commit'}).`);
