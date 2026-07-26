import { handleOcChat, type WorkerEnv } from './oc-chat';

type ContentKind = 'favorites' | 'mood' | 'zine';
type D1Result<T> = { results: T[] };
interface Statement { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; all<T>(): Promise<D1Result<T>>; run(): Promise<unknown>; }
interface Database { prepare(query: string): Statement; }
interface AuthEnv extends WorkerEnv {
  STUDIO_USERNAME?: string; STUDIO_PASSWORD?: string;
  GITHUB_CONTENT_TOKEN?: string; GITHUB_OWNER?: string; GITHUB_REPO?: string;
  DB?: Database;
  TURNSTILE_SECRET_KEY?: string;
  RATE_LIMIT_SALT?: string;
  OC_DAILY_LIMIT?: string;
}

const apiHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const contentKinds = new Set<ContentKind>(['favorites', 'mood', 'zine']);
const idPattern = /^[A-Za-z0-9_-]{8,64}$/;
function json(status: number, body: Record<string, unknown>): Response { return new Response(JSON.stringify(body), { status, headers: apiHeaders }); }
function isProtectedPath(pathname: string): boolean { return pathname === '/studio' || pathname.startsWith('/studio/') || pathname === '/editor' || pathname.startsWith('/editor/'); }
function unauthorized(): Response { return new Response('Authentication required', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'WWW-Authenticate': 'Basic realm="HELICASE Studio", charset="UTF-8"', 'Cache-Control': 'no-store' } }); }
function authorized(request: Request, env: AuthEnv): boolean {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Basic ') || !env.STUDIO_USERNAME || !env.STUDIO_PASSWORD) return false;
  try { const decoded = atob(header.slice(6)); const i = decoded.indexOf(':'); return i >= 0 && decoded.slice(0, i) === env.STUDIO_USERNAME && decoded.slice(i + 1) === env.STUDIO_PASSWORD; } catch { return false; }
}
function base64Utf8(value: string): string { const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function database(env: AuthEnv): Database | null { return env.DB ?? null; }
function kind(value: string): ContentKind | null { return contentKinds.has(value as ContentKind) ? value as ContentKind : null; }
function newId(): string { return crypto.randomUUID().replace(/-/g, ''); }
function safeText(value: unknown, max: number): string { return String(value ?? '').trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, max); }
function validUrl(value: unknown): string | null { try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } }

async function subject(request: Request, env: AuthEnv): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const bytes = new TextEncoder().encode(`${env.RATE_LIMIT_SALT || 'change-this-salt'}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 12).map(n => n.toString(16).padStart(2, '0')).join('');
}
async function takeRateLimit(request: Request, env: AuthEnv, bucket: string, maximum: number, seconds: number): Promise<boolean> {
  const db = database(env); if (!db) return false;
  const windowStart = Math.floor(Date.now() / 1000 / seconds) * seconds;
  const row = await db.prepare('INSERT INTO rate_limits (bucket, subject, window_start, count) VALUES (?, ?, ?, 1) ON CONFLICT(bucket, subject, window_start) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(bucket, await subject(request, env), windowStart).first<{ count: number }>();
  return !!row && row.count <= maximum;
}
async function takeOcBudget(env: AuthEnv): Promise<boolean> {
  const db = database(env); if (!db) return false;
  const day = new Date().toISOString().slice(0, 10); const max = Math.max(1, Math.min(Number(env.OC_DAILY_LIMIT || 100), 1000));
  const row = await db.prepare('INSERT INTO oc_daily_usage (day, requests) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET requests = requests + 1 RETURNING requests').bind(day).first<{ requests: number }>();
  return !!row && row.requests <= max;
}
async function verifyTurnstile(request: Request, env: AuthEnv, token: unknown): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // local/dev remains usable; production must set this secret.
  if (!token || typeof token !== 'string' || token.length > 4096) return false;
  const form = new FormData(); form.set('secret', env.TURNSTILE_SECRET_KEY); form.set('response', token);
  const ip = request.headers.get('CF-Connecting-IP'); if (ip) form.set('remoteip', ip);
  try { const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form }); return (await res.json() as { success?: boolean }).success === true; } catch { return false; }
}

async function publishArticle(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!env.GITHUB_CONTENT_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) return json(503, { error: 'Publishing is not configured' });
  let payload: { category?: unknown; filename?: unknown; content?: unknown }; try { payload = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const category = String(payload.category || ''), filename = String(payload.filename || ''), content = String(payload.content || '');
  if (!['tech', 'daily', 'reviews'].includes(category) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.md$/.test(filename) || !content || content.length > 120_000 || !content.startsWith('---')) return json(400, { error: 'Invalid article payload' });
  const path = `src/content/blog/${category}/${filename}`, apiUrl = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path}`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GITHUB_CONTENT_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'HELICASE-publisher' };
  let sha: string | undefined; const existing = await fetch(apiUrl, { headers }); if (existing.ok) sha = (await existing.json() as { sha?: string }).sha; else if (existing.status !== 404) return json(502, { error: 'Could not inspect GitHub content' });
  const response = await fetch(apiUrl, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `${sha ? 'update' : 'publish'}: ${filename}`, content: base64Utf8(content), branch: 'main', ...(sha ? { sha } : {}) }) });
  return response.ok ? json(200, { ok: true, path }) : json(502, { error: 'GitHub publish failed' });
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
  let body: { id?: unknown; item?: unknown }; try { body = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const item = validateContent(kindName, body.item); if (!item) return json(400, { error: 'Invalid content item' }); const itemId = typeof body.id === 'string' && idPattern.test(body.id) ? body.id : newId();
  await db.prepare("INSERT INTO content_items (id, kind, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, kind = excluded.kind, updated_at = datetime('now')").bind(itemId, kindName, JSON.stringify(item)).run(); return json(200, { ok: true, id: itemId });
}
async function publicComments(request: Request, env: AuthEnv): Promise<Response> {
  const db = database(env); if (!db) return json(503, { error: 'Comment storage is not configured' }); const url = new URL(request.url);
  if (request.method === 'GET') { const target = url.searchParams.get('target') || ''; if (!idPattern.test(target)) return json(400, { error: 'Invalid target' }); const rows = await db.prepare("SELECT id, author, body, created_at FROM comments WHERE target_kind = 'zine' AND target_id = ? AND status = 'approved' ORDER BY created_at DESC").bind(target).all(); return json(200, { items: rows.results }); }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }); let body: Record<string, unknown>; try { body = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const target = safeText(body.target, 64), author = safeText(body.author, 24) || 'anonymous', text = safeText(body.body, 400); if (!idPattern.test(target) || !text) return json(400, { error: 'Invalid comment' });
  if (!await verifyTurnstile(request, env, body.turnstileToken)) return json(403, { error: 'Verification failed' }); if (!await takeRateLimit(request, env, 'comment', 5, 3600)) return json(429, { error: 'Please try again later' });
  await db.prepare("INSERT INTO comments (id, target_kind, target_id, author, body, status) VALUES (?, 'zine', ?, ?, ?, 'pending')").bind(newId(), target, author, text).run(); return json(202, { ok: true, status: 'pending' });
}
async function adminComments(request: Request, env: AuthEnv): Promise<Response> {
  const db = database(env); if (!db) return json(503, { error: 'Comment storage is not configured' }); if (request.method === 'GET') { const rows = await db.prepare("SELECT id, target_id, author, body, status, created_at FROM comments WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100").all(); return json(200, { items: rows.results }); }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }); let body: Record<string, unknown>; try { body = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); } const id = safeText(body.id, 64), status = body.status === 'approved' ? 'approved' : body.status === 'rejected' ? 'rejected' : ''; if (!idPattern.test(id) || !status) return json(400, { error: 'Invalid moderation action' }); await db.prepare('UPDATE comments SET status = ? WHERE id = ?').bind(status, id).run(); return json(200, { ok: true });
}
async function adminSite(request: Request, env: AuthEnv, name: string): Promise<Response> {
  const db = database(env); if (!db) return json(503, { error: 'Site settings storage is not configured' });
  if (!['profile', 'links', 'projects'].includes(name)) return json(404, { error: 'Not found' });
  if (request.method === 'GET') { const row = await db.prepare('SELECT payload FROM site_settings WHERE key = ?').bind(name).first<{ payload: string }>(); return json(200, { value: row ? JSON.parse(row.payload) : null }); }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }); let body: { value?: unknown }; try { body = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const value = body.value; if (!value || typeof value !== 'object' || JSON.stringify(value).length > 20_000) return json(400, { error: 'Invalid setting' });
  await db.prepare("INSERT INTO site_settings (key, payload) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = datetime('now')").bind(name, JSON.stringify(value)).run();
  return json(200, { ok: true, note: 'Saved to Studio storage. Public source publishing remains an explicit later action.' });
}

export default { async fetch(request: Request, env: AuthEnv): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if ((isProtectedPath(pathname) || pathname === '/api/publish' || pathname.startsWith('/api/admin/')) && !authorized(request, env)) return unauthorized();
  if (pathname === '/api/oc-chat') {
    if (!database(env)) return json(503, { error: 'OC protection storage is not configured' }); let body: { turnstileToken?: unknown }; try { body = await request.clone().json(); } catch { return json(400, { error: 'Invalid request body' }); }
    if (!await verifyTurnstile(request, env, body.turnstileToken)) return json(403, { error: 'Verification failed' }); if (!await takeRateLimit(request, env, 'oc', 10, 3600)) return json(429, { error: 'OC rate limit reached; try again later' }); if (!await takeOcBudget(env)) return json(429, { error: 'OC is resting for today' }); return handleOcChat(request, env);
  }
  if (pathname === '/api/publish') return publishArticle(request, env);
  const contentMatch = pathname.match(/^\/api\/content\/(favorites|mood|zine)$/); if (contentMatch) return publicContent(request, env, contentMatch[1] as ContentKind);
  if (pathname === '/api/comments') return publicComments(request, env);
  const adminMatch = pathname.match(/^\/api\/admin\/content\/(favorites|mood|zine)(?:\/([A-Za-z0-9_-]{8,64}))?$/); if (adminMatch) return adminContent(request, env, adminMatch[1] as ContentKind, adminMatch[2]);
  if (pathname === '/api/admin/comments') return adminComments(request, env);
  const siteMatch = pathname.match(/^\/api\/admin\/site\/(profile|links|projects)$/); if (siteMatch) return adminSite(request, env, siteMatch[1]);
  if (pathname.startsWith('/api/')) return json(404, { error: 'Not found' }); return env.ASSETS.fetch(request);
} };
