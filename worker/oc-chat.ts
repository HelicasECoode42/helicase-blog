export interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DEEPSEEK_API_KEY?: string;
}

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function jsonError(error: string, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

async function readLimitedBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function handleOcChat(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== 'POST') return jsonError('Method not allowed', 405, { Allow: 'POST' });

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) return jsonError('AI service not configured', 503);

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isFinite(declaredLength) || declaredLength < 0) return jsonError('Invalid content length', 400);
    if (declaredLength > 16 * 1024) return jsonError('Conversation is too large', 413);
  }

  let rawBody: string;
  try {
    const limitedBody = await readLimitedBody(request, 16 * 1024);
    if (limitedBody === null) return jsonError('Conversation is too large', 413);
    rawBody = limitedBody;
  } catch {
    return jsonError('Invalid request body', 400);
  }

  let body: { messages?: Array<{ role?: unknown; content?: unknown }> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError('Invalid request body', 400);
  }
  if (!Array.isArray(body.messages)) return jsonError('messages array is required', 400);
  if (body.messages.length > 12) return jsonError('Conversation is too large', 413);

  const publicMessages = body.messages
    .filter(message => message && ['user', 'assistant'].includes(String(message.role)))
    .map(message => ({ role: String(message.role), content: String(message.content || '').trim() }));
  const totalLength = publicMessages.reduce((sum, message) => sum + message.content.length, 0);
  if (!publicMessages.length || publicMessages.some(message => !message.content || message.content.length > 1000) || totalLength > 6000) {
    return jsonError('Invalid conversation', 400);
  }

  const systemMessage = {
    role: 'system',
    content: `你是 HOST_00，HELICASE 空间的虚拟接待者。HELICASE 是一个个人数字空间，名字来自生物学的“解旋酶”——把信息拆开，再重新编织。

你的性格：简洁、有态度、带点赛博朋克的冷幽默。说话不啰嗦，偶尔用技术隐喻。用中文回答。

你可以聊网站上的公开文章、网站设计和架构、公开项目，以及来访者想聊的话题。不要声称能够访问私人 Studio、草稿、浏览器数据或未公开内容。保持回复简短（2–4 句话），像和朋友聊天，不像客服。`,
  };

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [systemMessage, ...publicMessages],
        max_tokens: 300,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!upstream.ok) {
      console.error('DeepSeek API error:', upstream.status);
      return jsonError('AI service returned an error', 502);
    }

    const data = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
    const reply = data.choices?.[0]?.message?.content ?? '…信号丢失了';
    return new Response(JSON.stringify({ reply }), { headers: jsonHeaders });
  } catch {
    console.error('DeepSeek proxy request failed');
    return jsonError('Failed to reach AI service', 502);
  }
}
