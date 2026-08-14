import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const phase = process.argv[2] || 'build';
if (!['source', 'build'].includes(phase)) throw new Error('Usage: node scripts/assert-deploy-ready.mjs [source|build]');
if (process.env.ALLOW_INSECURE_TURNSTILE_BYPASS === 'true') throw new Error('Production deploy refused: ALLOW_INSECURE_TURNSTILE_BYPASS must not be true.');

async function git(...args) {
  return (await execFileAsync('git', args)).stdout.trim();
}

const branch = await git('branch', '--show-current');
if (branch !== 'main') throw new Error(`Production deploys must run from main, not ${branch || 'detached HEAD'}.`);
const dirty = await git('status', '--porcelain=v1', '--untracked-files=all');
if (dirty) throw new Error('Production deploy refused: the Git working tree is not clean. Commit or remove every change first.');
const head = await git('rev-parse', 'HEAD');
let upstream;
try { upstream = await git('rev-parse', '@{upstream}'); }
catch { throw new Error('Production deploy refused: main has no configured upstream.'); }
if (head !== upstream) throw new Error(`Production deploy refused: HEAD ${head.slice(0, 12)} is not the pushed upstream ${upstream.slice(0, 12)}.`);

if (phase === 'build') {
  const metaPath = fileURLToPath(new URL('../dist/build-meta.json', import.meta.url));
  let meta;
  try { meta = JSON.parse(await readFile(metaPath, 'utf8')); }
  catch { throw new Error('Production deploy refused: dist/build-meta.json is missing or invalid.'); }
  if (meta.commitSha !== head) throw new Error(`Production deploy refused: dist belongs to ${String(meta.commitSha).slice(0, 12)}, expected ${head.slice(0, 12)}.`);
  if (meta.sourceDirty !== false) throw new Error('Production deploy refused: the build was produced from a dirty or unverifiable source tree.');
  if (!Number.isFinite(Date.parse(meta.generatedAt))) throw new Error('Production deploy refused: build metadata has no valid timestamp.');
}

console.log(`Deploy ${phase} check passed (${head.slice(0, 12)} on clean, pushed main).`);
