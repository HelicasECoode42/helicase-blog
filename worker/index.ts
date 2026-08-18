import { handleOcChat, type WorkerEnv } from './oc-chat';

type ContentKind = 'favorites' | 'mood' | 'zine';
type SiteSettingName = 'profile' | 'links' | 'projects';
type D1Result<T> = { results: T[] };
interface Statement { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; all<T>(): Promise<D1Result<T>>; run(): Promise<unknown>; }
interface Database { prepare(query: string): Statement; }
interface AuthEnv extends WorkerEnv {
  STUDIO_USERNAME?: string; STUDIO_PASSWORD?: string;
  GITHUB_CONTENT_TOKEN?: string; GITHUB_OWNER?: string; GITHUB_REPO?: string;
  DB?: Database;
  TURNSTILE_SECRET_KEY?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  ALLOW_INSECURE_TURNSTILE_BYPASS?: string;
  RATE_LIMIT_SALT?: string;
  OC_DAILY_LIMIT?: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  GITHUB_API_BASE_URL?: string;
}

interface GitHubUser { id: number; login: string; avatar_url: string; html_url: string; }
interface SessionUser { id: number; login: string; avatarUrl: string; profileUrl: string; exp: number; }
interface SiteSettingRow {
  payload: string;
  revision: number;
  draft_hash: string | null;
  updated_at: string;
  published_hash: string | null;
  published_commit_sha: string | null;
  published_at: string | null;
}

const apiHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const idPattern = /^[A-Za-z0-9_-]{8,64}$/;
const commentTargetPattern = /^[\p{L}\p{N}_/-]{1,160}$/u;
const csrfCookieName = 'helicase_csrf';
const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function json(status: number, body: Record<string, unknown>): Response { return new Response(JSON.stringify(body), { status, headers: apiHeaders }); }
function isProtectedPath(pathname: string): boolean { return pathname === '/studio' || pathname.startsWith('/studio/') || pathname === '/editor' || pathname.startsWith('/editor/'); }
function unauthorized(): Response { return new Response('Authentication required', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'WWW-Authenticate': 'Basic realm="HELICASE Studio", charset="UTF-8"', 'Cache-Control': 'no-store' } }); }
function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  const length = Math.max(a.length, b.length); let mismatch = a.length ^ b.length;
  for (let index = 0; index < length; index++) mismatch |= (a[index] || 0) ^ (b[index] || 0);
  return mismatch === 0;
}
function basicCredentials(request: Request): { username: string; password: string } | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Basic ')) return null;
  try { const decoded = atob(header.slice(6)); const i = decoded.indexOf(':'); return i >= 0 ? { username: decoded.slice(0, i), password: decoded.slice(i + 1) } : null; } catch { return null; }
}
function authorized(request: Request, env: AuthEnv): boolean {
  const credentials = basicCredentials(request);
  return !!credentials && !!env.STUDIO_USERNAME && !!env.STUDIO_PASSWORD
    && constantTimeEqual(credentials.username, env.STUDIO_USERNAME)
    && constantTimeEqual(credentials.password, env.STUDIO_PASSWORD);
}
function isJsonContentType(request: Request): boolean {
  return (request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase() === 'application/json';
}
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !!origin && origin === new URL(request.url).origin;
}
function writeGuard(request: Request, csrfRequired: boolean): Response | null {
  if (!writeMethods.has(request.method)) return null;
  if (!isJsonContentType(request)) return json(415, { error: 'Write requests must use application/json' });
  if (!sameOrigin(request)) return json(403, { error: 'Cross-origin write rejected' });
  if (csrfRequired) {
    const supplied = request.headers.get('X-CSRF-Token'), expected = cookie(request, csrfCookieName);
    if (!supplied || !expected || !constantTimeEqual(supplied, expected)) return json(403, { error: 'CSRF validation failed' });
  }
  return null;
}
async function readLimitedBody(request: Request, maxBytes: number): Promise<string | null> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0) throw new Error('invalid content length');
    if (length > maxBytes) return null;
  }
  if (!request.body) return '';
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { await reader.cancel(); throw new Error('body read failed'); }
  const body = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}
async function limitedJson<T>(request: Request, maxBytes: number): Promise<{ value: T } | { response: Response }> {
  let raw: string | null;
  try { raw = await readLimitedBody(request, maxBytes); } catch { return { response: json(400, { error: 'Invalid request body' }) }; }
  if (raw === null) return { response: json(413, { error: 'Request body is too large' }) };
  try { return { value: JSON.parse(raw) as T }; } catch { return { response: json(400, { error: 'Invalid JSON' }) }; }
}
function base64Utf8(value: string): string { const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function database(env: AuthEnv): Database | null { return env.DB ?? null; }
function newId(): string { return crypto.randomUUID().replace(/-/g, ''); }
function safeText(value: unknown, max: number): string { return String(value ?? '').trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, max); }
function validUrl(value: unknown): string | null { try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function validSiteUrl(value: unknown, allowLocal = false): string | null {
  const text = String(value || '').trim();
  if (allowLocal && /^\/?(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]+)?$/.test(text) && text.startsWith('/')) return text;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(text)) return text;
  return validUrl(text);
}
async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function cookie(request: Request, name: string): string | null {
  const match = request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  if (!match) return null;
  try { return decodeURIComponent(match.slice(name.length + 1)); } catch { return null; }
}
function base64Url(bytes: Uint8Array): string {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(normalized), character => character.charCodeAt(0));
}
async function signature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}
async function signedValue(payload: object, secret: string): Promise<string> {
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encoded}.${await signature(encoded, secret)}`;
}
async function verifySignedValue<T>(value: string | null, secret: string): Promise<T | null> {
  if (!value) return null; const [payload, supplied, extra] = value.split('.'); if (!payload || !supplied || extra) return null;
  const expected = await signature(payload, secret); if (expected.length !== supplied.length) return null;
  let mismatch = 0; for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  if (mismatch) return null;
  try { return JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as T; } catch { return null; }
}
async function currentUser(request: Request, env: AuthEnv): Promise<SessionUser | null> {
  if (!env.SESSION_SECRET) return null;
  const user = await verifySignedValue<SessionUser>(cookie(request, 'helicase_session'), env.SESSION_SECRET);
  return user && Number.isInteger(user.id) && user.exp > Date.now() ? user : null;
}
function safeReturnTo(value: unknown, origin: string): string {
  try {
    const resolved = new URL(String(value || '/'), origin);
    if (resolved.origin !== origin) return '/';
    return `${resolved.pathname}${resolved.search}${resolved.hash}`.slice(0, 500) || '/';
  } catch { return '/'; }
}
function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' }); for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers });
}
function withCsrfCookie(request: Request, response: Response): Response {
  if (request.method !== 'GET' || !isProtectedPath(new URL(request.url).pathname) || cookie(request, csrfCookieName)) return response;
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', `${csrfCookieName}=${token}; Path=/; Secure; SameSite=Strict; Max-Age=28800`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function githubLogin(request: Request, env: AuthEnv): Promise<Response> {
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.SESSION_SECRET) return json(503, { error: 'GitHub login is not configured' });
  const url = new URL(request.url); const state = crypto.randomUUID(); const returnTo = safeReturnTo(url.searchParams.get('returnTo'), url.origin);
  const stateCookie = await signedValue({ state, returnTo, exp: Date.now() + 10 * 60_000 }, env.SESSION_SECRET);
  const authorize = new URL('https://github.com/login/oauth/authorize'); authorize.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID); authorize.searchParams.set('redirect_uri', `${url.origin}/api/auth/github/callback`); authorize.searchParams.set('state', state); authorize.searchParams.set('scope', 'read:user');
  return redirect(authorize.href, [`helicase_oauth=${encodeURIComponent(stateCookie)}; Path=/api/auth/github/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`]);
}
async function githubCallback(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url); const clearState = 'helicase_oauth=; Path=/api/auth/github/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET || !env.SESSION_SECRET) return redirect('/?login=unavailable', [clearState]);
  const saved = await verifySignedValue<{ state: string; returnTo: string; exp: number }>(cookie(request, 'helicase_oauth'), env.SESSION_SECRET);
  if (!saved || saved.exp < Date.now() || saved.state !== url.searchParams.get('state') || !url.searchParams.get('code')) return redirect('/?login=failed', [clearState]);
  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'HELICASE-login' }, body: JSON.stringify({ client_id: env.GITHUB_OAUTH_CLIENT_ID, client_secret: env.GITHUB_OAUTH_CLIENT_SECRET, code: url.searchParams.get('code'), redirect_uri: `${url.origin}/api/auth/github/callback` }) });
    const token = await tokenResponse.json() as { access_token?: string }; if (!tokenResponse.ok || !token.access_token) return redirect(`${saved.returnTo}?login=failed`, [clearState]);
    const userResponse = await fetch('https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'HELICASE-login' } });
    const github = await userResponse.json() as GitHubUser; if (!userResponse.ok || !github.id || !github.login) return redirect(`${saved.returnTo}?login=failed`, [clearState]);
    const session = await signedValue({ id: github.id, login: safeText(github.login, 39), avatarUrl: validUrl(github.avatar_url) || '', profileUrl: validUrl(github.html_url) || '', exp: Date.now() + 30 * 24 * 60 * 60_000 }, env.SESSION_SECRET);
    return redirect(saved.returnTo, [clearState, `helicase_session=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`]);
  } catch { return redirect(`${saved.returnTo}?login=failed`, [clearState]); }
}
async function authApi(request: Request, env: AuthEnv, pathname: string): Promise<Response> {
  if (pathname === '/api/auth/github') return githubLogin(request, env);
  if (pathname === '/api/auth/github/callback') return githubCallback(request, env);
  if (pathname === '/api/auth/me') { const user = await currentUser(request, env); return json(200, { user: user ? { login: user.login, avatarUrl: user.avatarUrl, profileUrl: user.profileUrl } : null }); }
  if (pathname === '/api/auth/logout') { const url = new URL(request.url); return redirect(safeReturnTo(url.searchParams.get('returnTo'), url.origin), ['helicase_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']); }
  return json(404, { error: 'Not found' });
}

async function subject(request: Request, env: AuthEnv, identity = ''): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const bytes = new TextEncoder().encode(`${env.RATE_LIMIT_SALT || 'change-this-salt'}:${ip}:${identity}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 12).map(n => n.toString(16).padStart(2, '0')).join('');
}
async function takeRateLimit(request: Request, env: AuthEnv, bucket: string, maximum: number, seconds: number, identity = ''): Promise<boolean> {
  const db = database(env); if (!db) return false;
  const windowStart = Math.floor(Date.now() / 1000 / seconds) * seconds;
  const row = await db.prepare('INSERT INTO rate_limits (bucket, subject, window_start, count) VALUES (?, ?, ?, 1) ON CONFLICT(bucket, subject, window_start) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(bucket, await subject(request, env, identity), windowStart).first<{ count: number }>();
  return !!row && row.count <= maximum;
}
async function authFailureAllowed(request: Request, env: AuthEnv): Promise<boolean> {
  if (!database(env)) return true;
  const username = basicCredentials(request)?.username || 'missing';
  const ipAllowed = await takeRateLimit(request, env, 'auth-failure-ip', 12, 900);
  const accountAllowed = await takeRateLimit(request, env, 'auth-failure-account', 8, 900, username.slice(0, 120));
  return ipAllowed && accountAllowed;
}
async function takeOcBudget(env: AuthEnv): Promise<boolean> {
  const db = database(env); if (!db) return false;
  const day = new Date().toISOString().slice(0, 10); const max = Math.max(1, Math.min(Number(env.OC_DAILY_LIMIT || 100), 1000));
  const row = await db.prepare('INSERT INTO oc_daily_usage (day, requests) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET requests = requests + 1 RETURNING requests').bind(day).first<{ requests: number }>();
  return !!row && row.requests <= max;
}
async function verifyTurnstile(request: Request, env: AuthEnv, token: unknown): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    const hostname = new URL(request.url).hostname;
    const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    return local && env.ALLOW_INSECURE_TURNSTILE_BYPASS === 'true';
  }
  if (!token || typeof token !== 'string' || token.length > 4096) return false;
  const form = new FormData(); form.set('secret', env.TURNSTILE_SECRET_KEY); form.set('response', token);
  const ip = request.headers.get('CF-Connecting-IP'); if (ip) form.set('remoteip', ip);
  try { const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form }); return (await res.json() as { success?: boolean }).success === true; } catch { return false; }
}

async function publishArticle(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!env.GITHUB_CONTENT_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) return json(503, { error: 'Publishing is not configured' });
  const parsed = await limitedJson<{ category?: unknown; filename?: unknown; content?: unknown }>(request, 128 * 1024); if ('response' in parsed) return parsed.response;
  const payload = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
  const category = String(payload.category || ''), filename = String(payload.filename || ''), content = String(payload.content || '');
  if (!['tech', 'daily', 'reviews'].includes(category) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.md$/.test(filename) || !content || content.length > 120_000 || !content.startsWith('---')) return json(400, { error: 'Invalid article payload' });
  const path = `src/content/blog/${category}/${filename}`, apiUrl = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path}`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GITHUB_CONTENT_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'HELICASE-publisher' };
  let sha: string | undefined; const existing = await fetch(apiUrl, { headers }); if (existing.ok) sha = (await existing.json() as { sha?: string }).sha; else if (existing.status !== 404) return json(502, { error: 'Could not inspect GitHub content' });
  const response = await fetch(apiUrl, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `${sha ? 'update' : 'publish'}: ${filename}`, content: base64Utf8(content), branch: 'main', ...(sha ? { sha } : {}) }) });
  return response.ok ? json(200, { ok: true, path }) : json(502, { error: 'GitHub publish failed' });
}

async function adminArticles(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
  if (!env.GITHUB_CONTENT_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) return json(503, { error: 'GitHub publishing is not configured' });
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GITHUB_CONTENT_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'HELICASE-Studio' };
  const root = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
  try {
    const treeResponse = await fetch(`${root}/git/trees/main?recursive=1`, { headers });
    if (!treeResponse.ok) return json(502, { error: 'Could not list GitHub articles' });
    const tree = await treeResponse.json() as { tree?: Array<{ path?: string; type?: string }> };
    const paths = (tree.tree || []).map(item => item.path || '').filter(path => /^src\/content\/blog\/(tech|daily|reviews)\/[^/]+\.md$/.test(path)).sort().reverse().slice(0, 100);
    const articles = await Promise.all(paths.map(async path => {
      const response = await fetch(`${root}/contents/${path}`, { headers });
      if (!response.ok) return { path, title: path.split('/').pop(), draft: null };
      const file = await response.json() as { content?: string };
      const text = file.content ? new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\n/g, '')), ch => ch.charCodeAt(0))) : '';
      const title = text.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] || path.split('/').pop();
      const date = text.match(/^date:\s*(.+)\s*$/m)?.[1] || '';
      return { path, title, date, draft: /^draft:\s*true\s*$/m.test(text), category: path.split('/')[3] };
    }));
    return json(200, { items: articles });
  } catch { return json(502, { error: 'Could not inspect GitHub articles' }); }
}

function validateContent(kindName: ContentKind, payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null; const p = payload as Record<string, unknown>;
  if (kindName === 'favorites') { const bgmId = Number(p.bgmId); const cover = validUrl(p.cover); if (!Number.isInteger(bgmId) || bgmId < 1 || !cover) return null; return { bgmId, name: safeText(p.name, 120), name_cn: safeText(p.name_cn, 120), cover, type: Math.max(0, Math.min(99, Number(p.type) || 0)), typeLabel: safeText(p.typeLabel, 16), rating: Math.max(0, Math.min(10, Number(p.rating) || 0)), note: safeText(p.note, 500) }; }
  const image = validUrl(p.image || p.url); if (!image) return null;
  return kindName === 'mood' ? { image, alt: safeText(p.alt, 160) } : { image, caption: safeText(p.caption, 300), title: safeText(p.title, 100) };
}
async function publicContent(request: Request, env: AuthEnv, kindName: ContentKind): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' }); const db = database(env); if (!db) return json(503, { error: 'Content storage is not configured' });
  const rows = await db.prepare('SELECT id, payload, created_at, updated_at FROM content_items WHERE kind = ? ORDER BY created_at DESC').bind(kindName).all<{ id: string; payload: string; created_at: string; updated_at: string }>();
  const items = rows.results.map(row => ({ id: row.id, ...JSON.parse(row.payload) as object, createdAt: row.created_at, updatedAt: row.updated_at })); return json(200, { items });
}
async function adminContent(request: Request, env: AuthEnv, kindName: ContentKind, id?: string): Promise<Response> {
  const db = database(env); if (!db) return json(503, { error: 'Content storage is not configured' });
  if (request.method === 'GET') return publicContent(request, env, kindName);
  if (request.method === 'DELETE' && id && idPattern.test(id)) { await db.prepare('DELETE FROM content_items WHERE id = ? AND kind = ?').bind(id, kindName).run(); return json(200, { ok: true }); }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const parsed = await limitedJson<{ id?: unknown; item?: unknown }>(request, 32 * 1024); if ('response' in parsed) return parsed.response;
  const body = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
  const item = validateContent(kindName, body.item); if (!item) return json(400, { error: 'Invalid content item' }); const itemId = typeof body.id === 'string' && idPattern.test(body.id) ? body.id : newId();
  await db.prepare("INSERT INTO content_items (id, kind, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, kind = excluded.kind, updated_at = datetime('now')").bind(itemId, kindName, JSON.stringify(item)).run(); return json(200, { ok: true, id: itemId });
}
async function publicComments(request: Request, env: AuthEnv): Promise<Response> {
  const db = database(env); if (!db) return json(503, { error: 'Comment storage is not configured' }); const url = new URL(request.url);
  const targetKind = url.searchParams.get('kind') === 'blog' ? 'blog' : 'zine';
  if (request.method === 'GET') { const target = safeText(url.searchParams.get('target'), 160); if (!commentTargetPattern.test(target)) return json(400, { error: 'Invalid target' }); const rows = await db.prepare("SELECT id, author, body, avatar_url, author_url, created_at FROM comments WHERE target_kind = ? AND target_id = ? AND status = 'approved' ORDER BY created_at ASC").bind(targetKind, target).all(); return json(200, { items: rows.results }); }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const parsed = await limitedJson<Record<string, unknown>>(request, 8 * 1024); if ('response' in parsed) return parsed.response;
  const body = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
  const bodyKind = body.kind === 'blog' ? 'blog' : 'zine', target = safeText(body.target, 160), text = safeText(body.body, 1000); if (!commentTargetPattern.test(target) || !text) return json(400, { error: 'Invalid comment' });
  if (!await takeRateLimit(request, env, 'comment', 10, 3600)) return json(429, { error: 'Please try again later' });
  const user = await currentUser(request, env);
  if (bodyKind === 'blog' && !user) return json(401, { error: 'Sign in with GitHub to comment' });
  if (!user && !await verifyTurnstile(request, env, body.turnstileToken)) return json(403, { error: 'Verification failed' });
  const author = user?.login || safeText(body.author, 24) || 'anonymous', status = user ? 'approved' : 'pending';
  await db.prepare("INSERT INTO comments (id, target_kind, target_id, author, body, status, github_id, avatar_url, author_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(newId(), bodyKind, target, author, text, status, user?.id || null, user?.avatarUrl || null, user?.profileUrl || null).run(); return json(user ? 201 : 202, { ok: true, status });
}
async function adminComments(request: Request, env: AuthEnv): Promise<Response> {
  const db = database(env); if (!db) return json(503, { error: 'Comment storage is not configured' }); if (request.method === 'GET') { const rows = await db.prepare("SELECT id, target_id, author, body, status, created_at FROM comments WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100").all(); return json(200, { items: rows.results }); }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }); const parsed = await limitedJson<Record<string, unknown>>(request, 4 * 1024); if ('response' in parsed) return parsed.response; const body = parsed.value && typeof parsed.value === 'object' ? parsed.value : {}; const id = safeText(body.id, 64), status = body.status === 'approved' ? 'approved' : body.status === 'rejected' ? 'rejected' : ''; if (!idPattern.test(id) || !status) return json(400, { error: 'Invalid moderation action' }); await db.prepare('UPDATE comments SET status = ? WHERE id = ?').bind(status, id).run(); return json(200, { ok: true });
}
function validateSiteSetting(name: SiteSettingName, input: unknown): unknown | null {
  const object = input && typeof input === 'object' ? input as Record<string, unknown> : null;
  if (name === 'profile') {
    if (!object) return null;
    const avatar = validSiteUrl(object.avatar, true), profileName = safeText(object.name, 48), bio = safeText(object.bio, 140);
    const socials = Array.isArray(object.socials) ? object.socials : null;
    if (!avatar || !profileName || !socials || socials.length > 12) return null;
    const normalized = socials.map(item => {
      const social = item && typeof item === 'object' ? item as Record<string, unknown> : null;
      const label = safeText(social?.label, 32), url = validSiteUrl(social?.url);
      return label && url ? { label, url } : null;
    });
    if (normalized.some(item => !item)) return null;
    return { avatar, name: profileName, bio, socials: normalized };
  }
  if (name === 'links') {
    if (!Array.isArray(input) || input.length > 100) return null;
    const links = input.map(item => {
      const link = item && typeof item === 'object' ? item as Record<string, unknown> : null;
      const linkName = safeText(link?.name, 80), note = safeText(link?.note, 240), url = validSiteUrl(link?.url);
      return linkName && url ? { name: linkName, note, url } : null;
    });
    return links.some(item => !item) ? null : links;
  }
  if (!Array.isArray(input) || input.length > 100) return null;
  const ids = new Set<string>();
  const projects = input.map(item => {
    const project = item && typeof item === 'object' ? item as Record<string, unknown> : null;
    const id = safeText(project?.id, 64);
    if (!project || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || ids.has(id)) return null;
    ids.add(id);
    const textFields = ['name', 'type', 'summary', 'current', 'next'] as const;
    const values = Object.fromEntries(textFields.map(field => [field, safeText(project[field], field === 'summary' ? 400 : 180)]));
    if (textFields.some(field => !values[field])) return null;
    const rawStatus = safeText(project.status, 20), rawPhase = safeText(project.phase, 20);
    const status = ['active', 'paused', 'archived'].includes(rawStatus) ? rawStatus : rawStatus === 'forming' ? 'active' : '';
    const phase = ['exploring', 'building', 'validating', 'maintaining'].includes(rawPhase)
      ? rawPhase : rawStatus === 'forming' ? 'exploring' : rawPhase ? '' : 'building';
    if (!status || !phase) return null;
    const stack = Array.isArray(project.stack) ? project.stack.map(value => safeText(value, 40)).filter(Boolean) : null;
    const githubRepos = Array.isArray(project.githubRepos) ? project.githubRepos.map(value => safeText(value, 160)).filter(Boolean) : [];
    const normalizeRefs = (value: unknown) => Array.isArray(value) && value.length <= 20 ? value.map(item => {
      const ref = item && typeof item === 'object' ? item as Record<string, unknown> : null;
      const label = safeText(ref?.label, 100), url = validSiteUrl(ref?.url, true);
      return label && url ? { label, url } : null;
    }) : null;
    const links = normalizeRefs(project.links ?? []), notes = normalizeRefs(project.notes ?? []);
    if (!stack || stack.length > 20 || githubRepos.length > 20 || githubRepos.some(repo => !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
      || !links || links.some(value => !value) || !notes || notes.some(value => !value)) return null;
    let milestone: { name: string; completed: number; total: number } | null = null;
    if (project.milestone !== undefined) {
      const raw = project.milestone && typeof project.milestone === 'object' ? project.milestone as Record<string, unknown> : null;
      const name = safeText(raw?.name, 120), completed = Number(raw?.completed), total = Number(raw?.total);
      if (!name || !Number.isInteger(completed) || !Number.isInteger(total) || completed < 0 || total < 1 || completed > total) return null;
      milestone = { name, completed, total };
    }
    const visibility = project.visibility === 'public' || project.visibility === 'private' ? project.visibility : '';
    if (!visibility) return null;
    const noteHint = safeText(project.noteHint, 180);
    return { id, ...values, status, phase, stack, githubRepos, visibility, links, notes, ...(milestone ? { milestone } : {}), ...(noteHint ? { noteHint } : {}) };
  });
  return projects.some(item => !item) ? null : projects;
}

function githubPublishing(env: AuthEnv) {
  if (!env.GITHUB_CONTENT_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) return null;
  const base = (env.GITHUB_API_BASE_URL || 'https://api.github.com').replace(/\/+$/, '');
  const root = `${base}/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GITHUB_CONTENT_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'HELICASE-Studio' };
  return { root, headers };
}

function publicationFields(row: Pick<SiteSettingRow, 'published_hash' | 'published_commit_sha' | 'published_at'>) {
  return {
    publishedHash: row.published_hash,
    publishedCommitSha: row.published_commit_sha,
    publishedAt: row.published_at,
  };
}

async function latestCommitForPath(github: NonNullable<ReturnType<typeof githubPublishing>>, path: string): Promise<string | null> {
  const response = await fetch(`${github.root}/commits?sha=main&path=${encodeURIComponent(path)}&per_page=1`, { headers: github.headers });
  if (!response.ok) return null;
  const commits = await response.json() as Array<{ sha?: string }>;
  return commits[0]?.sha || null;
}

async function recordSitePublication(db: Database, name: SiteSettingName, publishedHash: string, commitSha: string) {
  return db.prepare("UPDATE site_settings SET draft_hash = COALESCE(draft_hash, ?), published_hash = ?, published_commit_sha = ?, published_at = datetime('now') WHERE key = ? RETURNING revision, draft_hash, published_hash, published_commit_sha, published_at")
    .bind(publishedHash, publishedHash, commitSha, name)
    .first<Pick<SiteSettingRow, 'revision' | 'draft_hash' | 'published_hash' | 'published_commit_sha' | 'published_at'>>();
}

async function publishSiteSetting(request: Request, env: AuthEnv, name: SiteSettingName): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const db = database(env), github = githubPublishing(env);
  if (!db) return json(503, { error: 'Site settings storage is not configured' });
  if (!github) return json(503, { error: 'GitHub publishing is not configured' });
  const parsed = await limitedJson<{ expectedDraftHash?: unknown; expectedRevision?: unknown }>(request, 8 * 1024); if ('response' in parsed) return parsed.response;
  const body = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
  const row = await db.prepare('SELECT payload, revision, draft_hash, updated_at, published_hash, published_commit_sha, published_at FROM site_settings WHERE key = ?').bind(name).first<SiteSettingRow>();
  if (!row) return json(409, { error: 'Save a draft before publishing' });
  let raw: unknown; try { raw = JSON.parse(row.payload); } catch { return json(500, { error: 'Stored draft is invalid JSON' }); }
  const value = validateSiteSetting(name, raw);
  if (!value) return json(400, { error: `Invalid ${name} draft` });
  const serialized = `${JSON.stringify(value, null, 2)}\n`, draftHash = await sha256Text(serialized);
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== row.revision || typeof body.expectedDraftHash !== 'string' || body.expectedDraftHash !== draftHash) {
    return json(409, { error: 'Draft changed; reload before publishing', revision: row.revision, draftHash });
  }
  const path = `src/data/${name}.json`, apiUrl = `${github.root}/contents/${path}`;
  const existing = await fetch(apiUrl, { headers: github.headers });
  let fileSha: string | undefined, existingText = '';
  if (existing.ok) {
    const file = await existing.json() as { sha?: string; content?: string };
    fileSha = file.sha;
    if (file.content) existingText = new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\n/g, '')), character => character.charCodeAt(0)));
  } else if (existing.status !== 404) return json(502, { error: 'Could not inspect GitHub content' });
  let commitSha: string | null = null;
  if (existingText === serialized) {
    commitSha = await latestCommitForPath(github, path);
  } else {
    const response = await fetch(apiUrl, {
      method: 'PUT', headers: { ...github.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `publish: ${name}`, content: base64Utf8(serialized), branch: 'main', ...(fileSha ? { sha: fileSha } : {}) }),
    });
    if (!response.ok) return json(response.status === 409 ? 409 : 502, { error: response.status === 409 ? 'GitHub content changed; retry publishing' : 'GitHub publish failed' });
    const result = await response.json() as { commit?: { sha?: string }; content?: { sha?: string } };
    commitSha = result.commit?.sha || await latestCommitForPath(github, path);
  }
  if (!commitSha || !/^[a-f0-9]{40}$/i.test(commitSha)) return json(502, { error: 'GitHub publish succeeded but its commit SHA could not be verified' });
  const recorded = await recordSitePublication(db, name, draftHash, commitSha);
  if (!recorded) return json(500, { error: 'Published to GitHub, but publication metadata could not be recorded' });
  return json(200, {
    ok: true, state: 'published', alreadyPublished: existingText === serialized, path, commitSha, draftHash,
    revision: recorded.revision, draftChangedSincePublish: recorded.draft_hash !== draftHash,
    ...publicationFields(recorded),
  });
}

async function adminSite(request: Request, env: AuthEnv, name: SiteSettingName): Promise<Response> {
  const db = database(env); if (!db) return json(503, { error: 'Site settings storage is not configured' });
  if (request.method === 'GET') {
    const row = await db.prepare('SELECT payload, revision, draft_hash, updated_at, published_hash, published_commit_sha, published_at FROM site_settings WHERE key = ?').bind(name).first<SiteSettingRow>();
    if (!row) return json(200, { value: null, revision: 0, updatedAt: null, draftHash: null, publishedHash: null, publishedCommitSha: null, publishedAt: null });
    let raw: unknown; try { raw = JSON.parse(row.payload); } catch { return json(500, { error: 'Stored draft is invalid JSON' }); }
    const value = validateSiteSetting(name, raw);
    if (!value) return json(500, { error: `Stored ${name} draft does not match the current schema` });
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    const draftHash = row.draft_hash || await sha256Text(serialized);
    if (!row.draft_hash) await db.prepare('UPDATE site_settings SET draft_hash = ? WHERE key = ? AND draft_hash IS NULL').bind(draftHash, name).run();
    return json(200, { value, revision: row.revision, updatedAt: row.updated_at, draftHash, ...publicationFields(row) });
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }); const parsed = await limitedJson<{ value?: unknown; expectedRevision?: unknown }>(request, 32 * 1024); if ('response' in parsed) return parsed.response; const body = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
  const value = validateSiteSetting(name, body.value); if (!value || JSON.stringify(value).length > 20_000) return json(400, { error: `Invalid ${name} setting` });
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const draftHash = await sha256Text(serialized), expectedRevision = body.expectedRevision;
  if (!Number.isInteger(expectedRevision) || Number(expectedRevision) < 0) return json(400, { error: 'expectedRevision must be a non-negative integer' });
  const saved = expectedRevision === 0
    ? await db.prepare("INSERT INTO site_settings (key, payload, revision, draft_hash) VALUES (?, ?, 1, ?) ON CONFLICT(key) DO NOTHING RETURNING revision, updated_at, published_hash, published_commit_sha, published_at")
      .bind(name, JSON.stringify(value), draftHash).first<Pick<SiteSettingRow, 'revision' | 'updated_at' | 'published_hash' | 'published_commit_sha' | 'published_at'>>()
    : await db.prepare("UPDATE site_settings SET payload = ?, revision = revision + 1, draft_hash = ?, updated_at = datetime('now') WHERE key = ? AND revision = ? RETURNING revision, updated_at, published_hash, published_commit_sha, published_at")
      .bind(JSON.stringify(value), draftHash, name, expectedRevision).first<Pick<SiteSettingRow, 'revision' | 'updated_at' | 'published_hash' | 'published_commit_sha' | 'published_at'>>();
  if (!saved) {
    const current = await db.prepare('SELECT revision, draft_hash, updated_at FROM site_settings WHERE key = ?').bind(name).first<Pick<SiteSettingRow, 'revision' | 'draft_hash' | 'updated_at'>>();
    return json(409, { error: 'Draft changed in another session; reload before saving', revision: current?.revision ?? 0, draftHash: current?.draft_hash ?? null, updatedAt: current?.updated_at ?? null });
  }
  return json(200, {
    ok: true, state: 'draft-saved', revision: saved.revision, updatedAt: saved.updated_at, draftHash,
    ...publicationFields(saved), note: 'Draft saved privately. Public site is unchanged.',
  });
}

export default { async fetch(request: Request, env: AuthEnv): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/api/auth/')) return authApi(request, env, pathname);
  if (pathname === '/api/oc-config') return json(200, { sitekey: env.PUBLIC_TURNSTILE_SITE_KEY || '' });
  const protectedRequest = isProtectedPath(pathname) || pathname === '/api/publish' || pathname.startsWith('/api/admin/');
  if (protectedRequest && !authorized(request, env)) {
    if (!await authFailureAllowed(request, env)) return json(429, { error: 'Too many failed authentication attempts' });
    return unauthorized();
  }
  if (protectedRequest) { const guard = writeGuard(request, true); if (guard) return guard; }
  if (pathname === '/api/oc-chat') {
    const guard = writeGuard(request, false); if (guard) return guard;
    if (!database(env)) return json(503, { error: 'OC protection storage is not configured' });
    const parsed = await limitedJson<{ turnstileToken?: unknown }>(request.clone(), 16 * 1024); if ('response' in parsed) return parsed.response; const body = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
    if (!await verifyTurnstile(request, env, body.turnstileToken)) return json(403, { error: 'Verification failed' }); if (!await takeRateLimit(request, env, 'oc', 10, 3600)) return json(429, { error: 'OC rate limit reached; try again later' }); if (!await takeOcBudget(env)) return json(429, { error: 'OC is resting for today' }); return handleOcChat(request, env);
  }
  if (pathname === '/api/publish') return publishArticle(request, env);
  const contentMatch = pathname.match(/^\/api\/content\/(favorites|mood|zine)$/); if (contentMatch) return publicContent(request, env, contentMatch[1] as ContentKind);
  if (pathname === '/api/comments') { const guard = writeGuard(request, false); if (guard) return guard; return publicComments(request, env); }
  const adminMatch = pathname.match(/^\/api\/admin\/content\/(favorites|mood|zine)(?:\/([A-Za-z0-9_-]{8,64}))?$/); if (adminMatch) return adminContent(request, env, adminMatch[1] as ContentKind, adminMatch[2]);
  if (pathname === '/api/admin/comments') return adminComments(request, env);
  if (pathname === '/api/admin/articles') return adminArticles(request, env);
  const sitePublishMatch = pathname.match(/^\/api\/admin\/site\/(profile|links|projects)\/publish$/); if (sitePublishMatch) return publishSiteSetting(request, env, sitePublishMatch[1] as SiteSettingName);
  const siteMatch = pathname.match(/^\/api\/admin\/site\/(profile|links|projects)$/); if (siteMatch) return adminSite(request, env, siteMatch[1] as SiteSettingName);
  if (pathname.startsWith('/api/')) return json(404, { error: 'Not found' }); return withCsrfCookie(request, await env.ASSETS.fetch(request));
} };
