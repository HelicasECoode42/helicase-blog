import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import projects from '../../data/projects.json';
import siteConfig from '../../data/site-config.json';
import { buildActivityFeed } from '../../lib/activity-feed';

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = (await getCollection('blog', ({ data }) => !data.draft))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const activity = buildActivityFeed(posts).slice(0, 5);

  const payload = {
    site: {
      name: siteConfig.title,
      description: siteConfig.description,
      routes: [
        { path: '/', label: 'Canvas', purpose: '主页；快速查看当前重点、核心项目、最新文章与兴趣入口' },
        { path: '/now', label: 'Now', purpose: '最近在做什么，以及 GitHub、写作和手动记录留下的公开事实' },
        { path: '/projects', label: 'Work', purpose: '核心项目、当前目标、下一步与公开仓库证据' },
        { path: '/blog', label: 'Writings', purpose: '技术笔记、每日沉淀与评论文章' },
        { path: '/interests', label: 'Interests', purpose: '收藏、zine、mood 等工作之外的内容' },
        { path: '/links', label: 'Links', purpose: '外部链接与网络入口' },
        { path: '/about', label: 'About', purpose: '关于 HELICASE 和作者' },
      ],
    },
    projects: projects
      .filter(project => project.visibility === 'public')
      .map(project => ({
        name: project.name,
        path: `/projects/${project.id}`,
        type: project.type,
        status: project.status,
        phase: project.phase,
        summary: project.summary,
        current: project.current,
        next: project.next,
        stack: project.stack,
      })),
    writings: posts.slice(0, 12).map(post => ({
      title: post.data.title,
      path: `/blog/${post.id.replace(/\//g, '-')}`,
      category: post.data.category,
      date: post.data.date.toISOString().slice(0, 10),
      summary: post.data.summary,
      tags: post.data.tags,
    })),
    recentActivity: activity.map(item => ({ date: item.date, type: item.type, title: item.title })),
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
