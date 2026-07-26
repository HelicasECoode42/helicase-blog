import { handleOcChat, type WorkerEnv } from './oc-chat';

const apiHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    if (pathname === '/api/oc-chat') return handleOcChat(request, env);
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: apiHeaders });
    }

    // Static Assets normally serves non-API routes before this Worker runs.
    return env.ASSETS.fetch(request);
  },
};
