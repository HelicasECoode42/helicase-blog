import { handleOcChat, type WorkerEnv } from './oc-chat';

interface AuthEnv extends WorkerEnv {
  STUDIO_USERNAME?: string;
  STUDIO_PASSWORD?: string;
  GITHUB_CONTENT_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
}

const apiHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function isProtectedPath(pathname: string): boolean {
  return pathname === '/studio' || pathname.startsWith('/studio/')
    || pathname === '/editor' || pathname.startsWith('/editor/');
}

function unauthorized(): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="HELICASE Studio", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

function authorized(request: Request, env: AuthEnv): boolean {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Basic ') || !env.STUDIO_USERNAME || !env.STUDIO_PASSWORD) return false;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    return decoded.slice(0, separator) === env.STUDIO_USERNAME
      && decoded.slice(separator + 1) === env.STUDIO_PASSWORD;
  } catch {
    return false;
  }
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: apiHeaders });
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function publishArticle(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!env.GITHUB_CONTENT_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return json(503, { error: 'Publishing is not configured' });
  }

  let payload: { category?: unknown; filename?: unknown; content?: unknown };
  try { payload = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const category = String(payload.category || '');
  const filename = String(payload.filename || '');
  const content = String(payload.content || '');
  if (!['tech', 'daily', 'reviews'].includes(category)) return json(400, { error: 'Invalid category' });
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.md$/.test(filename)) return json(400, { error: 'Invalid filename' });
  if (!content || content.length > 120_000 || !content.startsWith('---')) return json(400, { error: 'Invalid article content' });

  const path = `src/content/blog/${category}/${filename}`;
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${env.GITHUB_CONTENT_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'HELICASE-publisher',
  };

  let sha: string | undefined;
  const existing = await fetch(apiUrl, { headers });
  if (existing.ok) {
    const data = await existing.json() as { sha?: string };
    sha = data.sha;
  } else if (existing.status !== 404) {
    return json(502, { error: 'Could not inspect GitHub content' });
  }

  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `${sha ? 'update' : 'publish'}: ${filename}`,
      content: base64Utf8(content),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) {
    console.error('GitHub publish failed:', response.status);
    return json(502, { error: 'GitHub publish failed' });
  }
  return json(200, { ok: true, path });
}

export default {
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    if ((isProtectedPath(pathname) || pathname === '/api/publish') && !authorized(request, env)) return unauthorized();

    if (pathname === '/api/oc-chat') return handleOcChat(request, env);
    if (pathname === '/api/publish') return publishArticle(request, env);
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: apiHeaders });
    }

    // Static Assets normally serves non-API routes before this Worker runs.
    return env.ASSETS.fetch(request);
  },
};
