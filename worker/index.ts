import { handleOcChat, type WorkerEnv } from './oc-chat';

interface AuthEnv extends WorkerEnv {
  STUDIO_USERNAME?: string;
  STUDIO_PASSWORD?: string;
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

export default {
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    if (isProtectedPath(pathname) && !authorized(request, env)) return unauthorized();

    if (pathname === '/api/oc-chat') return handleOcChat(request, env);
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: apiHeaders });
    }

    // Static Assets normally serves non-API routes before this Worker runs.
    return env.ASSETS.fetch(request);
  },
};
