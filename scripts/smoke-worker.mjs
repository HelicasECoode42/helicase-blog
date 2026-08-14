import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'helicase-worker-smoke-'));
const username = 'smoke-user', password = 'smoke-password';
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const publicationCommit = 'a'.repeat(40);
let githubContent = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function commandEnvironment() {
  return {
    ...process.env,
    XDG_CONFIG_HOME: join(temporary, 'config'),
    XDG_CACHE_HOME: join(temporary, 'cache'),
    WRANGLER_LOG_PATH: join(temporary, 'wrangler.log'),
    WRANGLER_SEND_METRICS: 'false',
    CI: 'true',
  };
}

async function run(executable, args, successPattern = null) {
  const child = spawn(executable, args, { cwd: root, env: commandEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', completed = false;
  const cleanOutput = () => output.replace(/\u001b\[[0-9;]*m/g, '');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (completed) return; completed = true; child.kill('SIGKILL');
      reject(new Error(`Command timed out:\n${output.slice(-6000)}`));
    }, 45_000);
    const finish = async () => {
      if (completed) return; completed = true; clearTimeout(timer);
      child.kill('SIGINT');
      await Promise.race([new Promise(done => child.once('exit', done)), new Promise(done => setTimeout(done, 2_000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve(output);
    };
    const collect = chunk => {
      output += chunk;
      if (successPattern?.test(cleanOutput())) finish();
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', error => { if (!completed) { completed = true; clearTimeout(timer); reject(error); } });
    child.once('exit', code => {
      if (completed) return; completed = true; clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(`${executable} ${args.join(' ')} failed:\n${output.slice(-6000)}`));
    });
  });
}

async function waitForWorker(url, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Worker exited before becoming ready:\n${output().slice(-6000)}`);
    try { await fetch(url); return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Worker did not become ready:\n${output().slice(-6000)}`);
}

async function startWorker(port, githubPort) {
  const args = [
    'dev', '--local', '--port', String(port), '--persist-to', temporary,
    '--var', `STUDIO_USERNAME:${username}`,
    '--var', `STUDIO_PASSWORD:${password}`,
    '--var', 'GITHUB_CONTENT_TOKEN:smoke-token',
    '--var', 'GITHUB_OWNER:smoke',
    '--var', 'GITHUB_REPO:smoke',
    '--var', `GITHUB_API_BASE_URL:http://127.0.0.1:${githubPort}`,
    '--var', 'ALLOW_INSECURE_TURNSTILE_BYPASS:true',
  ];
  const child = spawn(wrangler, args, { cwd: root, env: commandEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  await waitForWorker(`http://127.0.0.1:${port}/api/admin/site/profile`, child, () => output);
  return { child, output: () => output };
}

async function stopWorker(running) {
  if (!running || running.child.exitCode !== null) return;
  running.child.kill('SIGINT');
  const stopped = await Promise.race([
    new Promise(resolve => running.child.once('exit', () => resolve(true))),
    new Promise(resolve => setTimeout(() => resolve(false), 3_000)),
  ]);
  if (!stopped && running.child.exitCode === null) {
    running.child.kill('SIGKILL');
    await Promise.race([
      new Promise(resolve => running.child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 3_000)),
    ]);
  }
}

async function api(base, path, init = {}, authenticated = true) {
  const headers = new Headers(init.headers || {});
  if (authenticated) headers.set('Authorization', authorization);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

const githubPort = await freePort();
const github = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${githubPort}`);
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'GET' && url.pathname === '/repos/smoke/smoke/contents/src/data/profile.json') {
    if (!githubContent) { response.statusCode = 404; response.end('{"message":"Not Found"}'); return; }
    response.end(JSON.stringify({ sha: 'f'.repeat(40), content: Buffer.from(githubContent).toString('base64') }));
    return;
  }
  if (request.method === 'PUT' && url.pathname === '/repos/smoke/smoke/contents/src/data/profile.json') {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    githubContent = Buffer.from(body.content, 'base64').toString('utf8');
    response.end(JSON.stringify({ content: { sha: 'f'.repeat(40) }, commit: { sha: publicationCommit } }));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/repos/smoke/smoke/commits') {
    response.end(JSON.stringify([{ sha: publicationCommit }])); return;
  }
  response.statusCode = 404; response.end('{"message":"Not Found"}');
});

let running;
try {
  await new Promise((resolve, reject) => github.once('error', reject).listen(githubPort, '127.0.0.1', resolve));
  console.log('Smoke fixture: fake GitHub ready.');
  const legacyDatabase = new DatabaseSync(join(temporary, 'legacy.sqlite'));
  try {
    legacyDatabase.exec(await readFile(join(root, 'migrations/0001_public_space.sql'), 'utf8'));
    legacyDatabase.prepare('INSERT INTO site_settings (key, payload) VALUES (?, ?)').run('profile', JSON.stringify({ avatar: '/legacy.jpg', name: 'Legacy', bio: '', socials: [] }));
    legacyDatabase.exec(await readFile(join(root, 'migrations/0002_github_comments.sql'), 'utf8'));
    legacyDatabase.exec(await readFile(join(root, 'migrations/0003_site_setting_revisions.sql'), 'utf8'));
    const migrated = legacyDatabase.prepare('SELECT revision, draft_hash, published_hash, published_commit_sha, published_at FROM site_settings WHERE key = ?').get('profile');
    assert(migrated.revision === 1 && migrated.draft_hash === null && migrated.published_hash === null && migrated.published_commit_sha === null && migrated.published_at === null, 'Existing site_settings row did not migrate safely.');
  } finally { legacyDatabase.close(); }
  console.log('Smoke fixture: legacy D1 row migrated safely.');
  await run(
    wrangler,
    ['d1', 'migrations', 'apply', 'helicase-blog-data', '--local', '--persist-to', temporary],
    /0003_site_setting_revisions\.sql\s*│\s*✅/,
  );
  console.log('Smoke fixture: local D1 migrations applied.');
  const workerPort = await freePort();
  const base = `http://127.0.0.1:${workerPort}`;
  running = await startWorker(workerPort, githubPort);
  console.log('Smoke fixture: Worker ready.');

  const homeResponse = await fetch(`${base}/`), homeHtml = await homeResponse.text();
  const nowResponse = await fetch(`${base}/now`), nowHtml = await nowResponse.text();
  const homeLatest = homeHtml.match(/data-activity-date="([^"]+)"[^>]*data-activity-title="([^"]+)"/);
  const nowLatest = nowHtml.match(/data-activity-date="([^"]+)"[^>]*data-activity-title="([^"]+)"/);
  assert(homeResponse.status === 200 && nowResponse.status === 200 && homeLatest && nowLatest && homeLatest[1] === nowLatest[1] && homeLatest[2] === nowLatest[2], 'Static homepage and /now smoke failed.');
  const buildMeta = await (await fetch(`${base}/build-meta.json`)).json();
  assert(/^[a-f0-9]{40}$/i.test(buildMeta.commitSha || '') && ['profile', 'links', 'projects'].every(name => /^[a-f0-9]{64}$/i.test(buildMeta.contentHashes?.[name] || '')), 'Build metadata smoke failed.');
  const favorites = await api(base, '/api/content/favorites', {}, false);
  assert(favorites.status === 200 && Array.isArray(favorites.data.items), 'Public D1 content API smoke failed.');
  const unauthorized = await api(base, '/api/admin/site/profile', {}, false);
  assert(unauthorized.status === 401, `Expected unauthorized GET to return 401, got ${unauthorized.status}.`);
  const empty = await api(base, '/api/admin/site/profile');
  assert(empty.status === 200 && empty.data.revision === 0 && empty.data.value === null, 'Empty setting must start at revision 0.');

  for (const returnTo of ['//evil.example/phish', '/\\evil.example/phish', 'https://evil.example/phish']) {
    const logout = await fetch(`${base}/api/auth/logout?returnTo=${encodeURIComponent(returnTo)}`, { redirect: 'manual' });
    assert(logout.status === 302 && logout.headers.get('location') === '/', `Unsafe logout redirect was accepted: ${returnTo}`);
  }
  const safeLogout = await fetch(`${base}/api/auth/logout?returnTo=${encodeURIComponent('/now?from=logout#recent')}`, { redirect: 'manual' });
  assert(safeLogout.headers.get('location') === '/now?from=logout#recent', 'Safe same-origin logout redirect was rejected.');

  const productionBypass = await fetch(`${base}/api/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Host: 'helicase.xin' },
    body: JSON.stringify({ target: 'smoke-zine', author: 'smoke', body: 'must not bypass Turnstile' }),
  });
  assert(productionBypass.status === 403, `Turnstile bypass escaped localhost restriction (${productionBypass.status}).`);

  const legacyProjects = [{
    id: 'legacy-project', name: 'Legacy project', type: 'personal product', status: 'forming', progress: 58,
    summary: 'Old Studio draft', current: 'Migrating', next: 'Validate migration', stack: ['Astro'],
    updatedAt: '2026-08-04', visibility: 'public', links: [], notes: [],
  }];
  const missingVisibility = [{ ...legacyProjects[0] }]; delete missingVisibility[0].visibility;
  const typoVisibility = [{ ...legacyProjects[0], id: 'typo-project', visibility: 'publc' }];
  const missingVisibilitySave = await api(base, '/api/admin/site/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: missingVisibility, expectedRevision: 0 }) });
  const typoVisibilitySave = await api(base, '/api/admin/site/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: typoVisibility, expectedRevision: 0 }) });
  assert(missingVisibilitySave.status === 400 && typoVisibilitySave.status === 400, 'Invalid project visibility must fail closed.');
  const migratedProjectSave = await api(base, '/api/admin/site/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: legacyProjects, expectedRevision: 0 }) });
  const migratedProjects = await api(base, '/api/admin/site/projects');
  assert(migratedProjectSave.status === 200 && migratedProjects.status === 200
    && migratedProjects.data.value?.[0]?.status === 'active' && migratedProjects.data.value?.[0]?.phase === 'exploring'
    && Array.isArray(migratedProjects.data.value?.[0]?.githubRepos) && !('progress' in migratedProjects.data.value[0]),
  'Legacy project draft was not normalized to the phase/milestone schema.');

  const profile1 = { avatar: '/avatar.jpg', name: 'Smoke', bio: 'revision one', socials: [{ label: 'GitHub', url: 'https://github.com/example' }] };
  const save1 = await api(base, '/api/admin/site/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: profile1, expectedRevision: 0 }) });
  assert(save1.status === 200 && save1.data.revision === 1 && /^[a-f0-9]{64}$/.test(save1.data.draftHash), 'Initial CAS save failed.');
  const duplicateInitial = await api(base, '/api/admin/site/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: profile1, expectedRevision: 0 }) });
  assert(duplicateInitial.status === 409 && duplicateInitial.data.revision === 1, 'Concurrent initial save was not rejected.');

  const profile2 = { ...profile1, bio: 'revision two' };
  const save2 = await api(base, '/api/admin/site/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: profile2, expectedRevision: 1 }) });
  assert(save2.status === 200 && save2.data.revision === 2, 'Revision update failed.');
  const staleSave = await api(base, '/api/admin/site/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: profile1, expectedRevision: 1 }) });
  assert(staleSave.status === 409 && staleSave.data.revision === 2, 'Stale draft save was not rejected.');
  const stalePublish = await api(base, '/api/admin/site/profile/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 1, expectedDraftHash: save1.data.draftHash }) });
  assert(stalePublish.status === 409, 'Stale publish was not rejected.');

  const publish = await api(base, '/api/admin/site/profile/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 2, expectedDraftHash: save2.data.draftHash }) });
  assert(publish.status === 200 && publish.data.commitSha === publicationCommit && publish.data.publishedHash === save2.data.draftHash, 'Successful publish metadata is incomplete.');
  const published = await api(base, '/api/admin/site/profile');
  assert(published.data.revision === 2 && published.data.publishedCommitSha === publicationCommit && published.data.publishedHash === published.data.draftHash, 'Published state was not readable from D1.');
  console.log('Smoke fixture: CAS and publish assertions passed.');

  await stopWorker(running); running = await startWorker(workerPort, githubPort);
  console.log('Smoke fixture: Worker restarted.');
  const afterRestart = await api(base, '/api/admin/site/profile');
  assert(afterRestart.data.publishedCommitSha === publicationCommit && afterRestart.data.publishedHash === published.data.publishedHash, 'Published state did not survive a Worker restart.');

  const profile3 = { ...profile2, bio: 'private revision three' };
  const save3 = await api(base, '/api/admin/site/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: profile3, expectedRevision: 2 }) });
  assert(save3.status === 200 && save3.data.revision === 3 && save3.data.publishedHash === published.data.publishedHash && save3.data.draftHash !== save3.data.publishedHash, 'A newer private draft must preserve the last publication coordinates.');

  console.log('Worker smoke passed: auth, redirects, Turnstile isolation, strict visibility, migration, CAS saves, publish conflict, durable publication, and newer private draft.');
} finally {
  await stopWorker(running);
  github.closeAllConnections?.();
  await new Promise(resolve => github.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
