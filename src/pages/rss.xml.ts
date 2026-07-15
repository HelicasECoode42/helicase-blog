import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const escapeXml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://helicase.pages.dev');
  const posts = (await getCollection('blog', ({ data }) => !data.draft))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const items = posts.map(post => {
    const href = new URL(`/blog/${post.id.replace(/\//g, '-')}`, base).href;
    return `<item><title>${escapeXml(post.data.title)}</title><link>${href}</link><guid>${href}</guid><pubDate>${post.data.date.toUTCString()}</pubDate><description>${escapeXml(post.data.summary)}</description><category>${escapeXml(post.data.category)}</category></item>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>HELICASE Writings</title><link>${base.href}</link><description>技术笔记、日常记录与评论。</description><language>zh-CN</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
