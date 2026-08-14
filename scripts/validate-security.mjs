import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const studio = await readFile(path('../src/pages/studio.astro'), 'utf8');
const headers = await readFile(path('../public/_headers'), 'utf8');
const worker = await readFile(path('../worker/index.ts'), 'utf8');
const workflow = await readFile(path('../.github/workflows/sync-activity-history.yml'), 'utf8');
const failures = [];

if (/\.innerHTML\s*=/.test(studio)) failures.push('Studio must not assign API data through innerHTML.');
if (!studio.includes("url.protocol==='https:'")) failures.push('Studio image URLs must be restricted to HTTPS.');
for (const directive of [
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "connect-src 'self' https://api.bgm.tv https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
]) if (!headers.includes(directive)) failures.push(`Missing CSP directive: ${directive}`);
if (!worker.includes("return local && env.ALLOW_INSECURE_TURNSTILE_BYPASS === 'true'")) failures.push('Turnstile bypass must be explicit and restricted to localhost.');
if (worker.includes('if (!env.TURNSTILE_SECRET_KEY) return true')) failures.push('Turnstile still fails open.');
if (!worker.includes("resolved.origin !== origin")) failures.push('OAuth/logout redirects must enforce same-origin URLs.');
if (!worker.includes("project.visibility === 'public' || project.visibility === 'private'")) failures.push('Project visibility must be an explicit enum.');
if (/uses:\s+[^\s]+@v\d+\b/.test(workflow)) failures.push('GitHub Actions must be pinned to full commit SHAs.');
if (!workflow.includes('persist-credentials: false')) failures.push('Activity sync checkout credentials must not persist.');

if (failures.length) {
  for (const failure of failures) console.error(`Security validation: ${failure}`);
  process.exit(1);
}
console.log('Security validation passed.');
