import { createServer } from 'node:http';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const host = '127.0.0.1';
const port = Number(process.env.HELICASE_STUDIO_PORT || 4177);
const stateFile = fileURLToPath(new URL('../.helicase/studio-state.json', import.meta.url));
const stateExampleFile = fileURLToPath(new URL('../.helicase/studio-state.example.json', import.meta.url));
const allowedTypes = new Set(['progress', 'idea', 'learning', 'image', 'article']);
const defaultProfile = {
  avatar: '/images/avatar.svg', name: 'HELICASE', bio: '一张无边线索画布',
  socials: [{ label: 'github', url: 'https://github.com/HelicasE' }],
};

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://localhost:4321',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
};

async function readState() {
  try {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    return { ...state, profile: state.profile || defaultProfile };
  }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await copyFile(stateExampleFile, stateFile);
    return { ...(JSON.parse(await readFile(stateFile, 'utf8'))), profile: defaultProfile };
  }
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new Error('PAYLOAD_TOO_LARGE');
  }
  return JSON.parse(raw || '{}');
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, null);
  if (req.headers.origin && req.headers.origin !== 'http://localhost:4321') return json(res, 403, { error: 'Origin denied' });
  try {
    if (req.method === 'GET' && req.url === '/api/state') return json(res, 200, await readState());
    if (req.method === 'POST' && req.url === '/api/capture') {
      const input = await body(req);
      const type = String(input.type || '');
      const text = String(input.text || '').trim();
      if (!allowedTypes.has(type) || !text || text.length > 1000) return json(res, 400, { error: 'Invalid capture' });
      const state = await readState();
      state.captures.unshift({ id: crypto.randomUUID(), type, text, createdAt: new Date().toISOString(), status: 'inbox' });
      state.updatedAt = new Date().toISOString();
      await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      return json(res, 201, state);
    }
    if (req.method === 'POST' && req.url === '/api/capture/status') {
      const input = await body(req);
      const id = String(input.id || '');
      const status = String(input.status || '');
      if (!['inbox', 'approved', 'archived'].includes(status)) return json(res, 400, { error: 'Invalid status' });
      const state = await readState();
      const capture = state.captures.find(item => item.id === id);
      if (!capture) return json(res, 404, { error: 'Capture not found' });
      capture.status = status;
      state.updatedAt = new Date().toISOString();
      await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      return json(res, 200, state);
    }
    if (req.method === 'POST' && req.url === '/api/profile') {
      const input = await body(req);
      const name = String(input.name || '').trim();
      const bio = String(input.bio || '').trim();
      const avatar = String(input.avatar || '').trim();
      const socials = Array.isArray(input.socials) ? input.socials : [];
      const validUrl = value => {
        if (value.startsWith('/')) return true;
        try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
      };
      if (!name || name.length > 48 || bio.length > 140 || !validUrl(avatar) || socials.length > 8) return json(res, 400, { error: 'Invalid profile' });
      const cleanSocials = socials.map(item => ({ label: String(item.label || '').trim(), url: String(item.url || '').trim() }))
        .filter(item => item.label && item.label.length <= 24 && validUrl(item.url));
      const state = await readState();
      state.profile = { name, bio, avatar, socials: cleanSocials };
      state.updatedAt = new Date().toISOString();
      await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      return json(res, 200, state);
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 500;
    return json(res, status, { error: status === 500 ? 'Internal error' : 'Payload too large' });
  }
}).on('error', error => {
  console.error(`Studio API could not start: ${error.message}`);
  process.exitCode = 1;
}).listen(port, host, () => console.log(`HELICASE Studio API: http://${host}:${port}`));
