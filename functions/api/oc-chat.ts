// Cloudflare Pages Function — DeepSeek proxy for OC page
// Env var DEEPSEEK_API_KEY must be set in Cloudflare dashboard or .dev.vars

interface Env {
  DEEPSEEK_API_KEY: string;
}

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const apiKey = context.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'AI service not configured' }),
      { status: 503, headers: jsonHeaders }
    );
  }

  let body: { messages?: Array<{ role: string; content: string }> };
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: jsonHeaders }
    );
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return new Response(
      JSON.stringify({ error: 'messages array is required' }),
      { status: 400, headers: jsonHeaders }
    );
  }

  const contentLength = Number(context.request.headers.get('content-length') || 0);
  if (contentLength > 16 * 1024 || body.messages.length > 12) {
    return new Response(JSON.stringify({ error: 'Conversation is too large' }), { status: 413, headers: jsonHeaders });
  }

  const publicMessages = body.messages
    .filter(message => message && ['user', 'assistant'].includes(message.role))
    .map(message => ({ role: message.role, content: String(message.content || '').trim() }));
  const totalLength = publicMessages.reduce((sum, message) => sum + message.content.length, 0);
  if (!publicMessages.length || publicMessages.some(message => !message.content || message.content.length > 1000) || totalLength > 6000) {
    return new Response(JSON.stringify({ error: 'Invalid conversation' }), { status: 400, headers: jsonHeaders });
  }

  // System prompt — HOST_00 persona
  const systemMsg = {
    role: 'system',
    content: `你是 HOST_00，HELICASE 空间的虚拟接待者。HELICASE 是一个个人数字空间，名字来自生物学的"解旋酶"——把信息拆开，再重新编织。

你的性格：简洁、有态度、带点赛博朋克的冷幽默。说话不啰嗦，偶尔用技术隐喻。用中文回答。

你可以聊的话题：
- 网站上的文章（技术、日常、评论）
- 网站本身的设计和架构
- 正在做的项目
- 任何来访者想聊的

保持回复简短（2-4句话），像和朋友聊天，不像客服。`,
  };

  const messages = [systemMsg, ...publicMessages];

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: 300,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      console.error('DeepSeek API error:', res.status);
      return new Response(
        JSON.stringify({ error: 'AI service returned an error' }),
        { status: 502, headers: jsonHeaders }
      );
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? '…信号丢失了';

    return new Response(JSON.stringify({ reply }), {
      headers: jsonHeaders,
    });
  } catch (err) {
    console.error('DeepSeek proxy error:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to reach AI service' }),
      { status: 502, headers: jsonHeaders }
    );
  }
};
