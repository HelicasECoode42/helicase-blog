import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const publicRoutes = ['/', '/about', '/blog', '/favorites', '/inspiration', '/interests', '/links', '/mood', '/music', '/now', '/oc', '/projects', '/zine'];

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://helicase.pages.dev');
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  const urls = [
    ...publicRoutes.map(path => ({ path, lastmod: null as string | null })),
    ...posts.map(post => ({ path: `/blog/${post.id.replace(/\//g, '-')}`, lastmod: post.data.date.toISOString() })),
  ];
  const body = urls.map(({ path, lastmod }) => `<url><loc>${new URL(path, base).href}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
