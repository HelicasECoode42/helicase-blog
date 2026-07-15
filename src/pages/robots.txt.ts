import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://helicase.pages.dev');
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /studio',
    'Disallow: /editor',
    `Sitemap: ${new URL('/sitemap.xml', base).href}`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
