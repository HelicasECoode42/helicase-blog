const base = String(process.argv[2] || process.env.SITE_URL || 'https://helicase.xin').replace(/\/+$/, '');
const errors = [];

async function get(path, init) {
  const response = await fetch(`${base}${path}`, { redirect: 'follow', signal: AbortSignal.timeout(15_000), ...init });
  return { response, text: await response.text() };
}

const home = await get('/');
if (home.response.status !== 200 || !home.text.includes('data-activity-title=')) errors.push(`/ must return the activity-enabled homepage (got ${home.response.status})`);
const now = await get('/now');
if (now.response.status !== 200 || !now.text.includes('data-activity-title=')) errors.push(`/now must return the shared activity feed (got ${now.response.status})`);
const homeLatest = home.text.match(/data-activity-date="([^"]+)"[^>]*data-activity-title="([^"]+)"/);
const nowLatest = now.text.match(/data-activity-date="([^"]+)"[^>]*data-activity-title="([^"]+)"/);
if (!homeLatest || !nowLatest || homeLatest[1] !== nowLatest[1] || homeLatest[2] !== nowLatest[2]) errors.push('Homepage and /now latest activities differ.');

const metaResponse = await get(`/build-meta.json?smoke=${Date.now()}`);
let meta;
try { meta = JSON.parse(metaResponse.text); } catch {}
if (metaResponse.response.status !== 200 || !/^[a-f0-9]{40}$/i.test(meta?.commitSha || '')) errors.push('/build-meta.json is missing a commit SHA.');
for (const name of ['profile', 'links', 'projects']) if (!/^[a-f0-9]{64}$/i.test(meta?.contentHashes?.[name] || '')) errors.push(`/build-meta.json is missing ${name} content hash.`);

for (const path of ['/studio', '/editor', '/api/admin/site/profile']) {
  const result = await get(path, { redirect: 'manual' });
  if (result.response.status !== 401) errors.push(`${path} must require Basic Auth (got ${result.response.status}).`);
}
const publicApi = await get('/api/content/favorites');
if (publicApi.response.status !== 200) errors.push(`/api/content/favorites must be publicly readable (got ${publicApi.response.status}).`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Site smoke passed for ${base} (${meta.commitSha.slice(0, 12)}).`);
}
