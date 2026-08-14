import type { CollectionEntry } from 'astro:content';
import activityHistory from '../data/activity-history.json';

export interface ActivityItem {
  date: string;
  type: string;
  title: string;
  source?: string;
  count?: number;
  project?: string;
  visibility?: string;
  timePrecision?: 'instant' | 'day';
}

type BlogPost = CollectionEntry<'blog'>;

interface HistoryEvent {
  id: string;
  occurredAt: string;
  source: 'github' | 'legacy-github-summary' | 'manual' | string;
  project: string;
  kind: string;
  action: string;
  count: number;
  title: string;
  visibility: string;
  timePrecision?: 'instant' | 'day';
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function shanghaiDateKey(value: Date | string): string {
  return dateFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function aggregateHistory(events: HistoryEvent[]): ActivityItem[] {
  const exactKeys = new Set(events
    .filter(event => event.source === 'github')
    .map(event => `${shanghaiDateKey(event.occurredAt)}\u0000${event.project}`));
  const buckets = new Map<string, {
    date: string;
    project: string;
    commits: number;
    discussions: number;
    releases: string[];
    pullRequests: Record<'opened' | 'merged' | 'closed', number>;
    issues: Record<'opened' | 'closed', string[]>;
    legacy?: HistoryEvent;
  }>();

  for (const event of events.filter(event => event.source === 'github' || event.source === 'legacy-github-summary')) {
    if (event.visibility !== 'public') continue;
    const date = shanghaiDateKey(event.occurredAt);
    const key = `${date}\u0000${event.project}`;
    if (event.source === 'legacy-github-summary' && exactKeys.has(key)) continue;
    if (!buckets.has(key)) buckets.set(key, {
      date, project: event.project, commits: 0, discussions: 0, releases: [],
      pullRequests: { opened: 0, merged: 0, closed: 0 },
      issues: { opened: [], closed: [] },
    });
    const bucket = buckets.get(key)!;
    if (event.source === 'legacy-github-summary') bucket.legacy = event;
    else if (event.kind === 'push') bucket.commits += event.count;
    else if (event.kind === 'pull_request' && event.action in bucket.pullRequests) {
      bucket.pullRequests[event.action as keyof typeof bucket.pullRequests] += event.count;
    } else if (event.kind === 'issue' && event.action in bucket.issues) {
      bucket.issues[event.action as keyof typeof bucket.issues].push(event.title);
    } else if (event.kind === 'discussion') bucket.discussions += event.count;
    else if (event.kind === 'release') bucket.releases.push(event.title || '新版本');
  }

  return [...buckets.values()].map(bucket => {
    if (bucket.legacy) return {
      date: bucket.date, type: 'github', title: `${bucket.legacy.title}（旧记录，仅日期）`,
      source: 'legacy-github-summary', project: bucket.project,
      count: bucket.legacy.count, visibility: 'public', timePrecision: 'day' as const,
    };
    const actions: string[] = [];
    if (bucket.commits) actions.push(`${bucket.commits} 个提交`);
    if (bucket.pullRequests.opened) actions.push(`开启 ${bucket.pullRequests.opened} 个 PR`);
    if (bucket.pullRequests.merged) actions.push(`合并 ${bucket.pullRequests.merged} 个 PR`);
    if (bucket.pullRequests.closed) actions.push(`关闭 ${bucket.pullRequests.closed} 个 PR`);
    if (bucket.issues.opened.length) actions.push(`提出 ${bucket.issues.opened.length} 个 Issue`);
    if (bucket.issues.closed.length) actions.push(`关闭 ${bucket.issues.closed.length} 个 Issue`);
    if (bucket.discussions) actions.push('参与讨论');
    if (bucket.releases.length) actions.push(`发布 ${bucket.releases.join('、')}`);
    const highlights = [...bucket.issues.opened, ...bucket.issues.closed].filter(Boolean).slice(0, 2);
    const count = bucket.commits + bucket.pullRequests.opened + bucket.pullRequests.merged
      + bucket.pullRequests.closed + bucket.issues.opened.length + bucket.issues.closed.length
      + bucket.discussions + bucket.releases.length;
    return {
      date: bucket.date, type: 'github',
      title: `${bucket.project}：${actions.join('，')}${highlights.length ? `：${highlights.join('；')}` : ''}`,
      source: 'github', project: bucket.project, count: Math.max(1, count),
      visibility: 'public', timePrecision: 'instant' as const,
    };
  }).filter(item => !item.title.endsWith('：'));
}

function manualHistoryItems(events: HistoryEvent[]): ActivityItem[] {
  return events
    .filter(event => event.source === 'manual' && event.visibility === 'public')
    .map(event => ({
      date: shanghaiDateKey(event.occurredAt), type: event.kind, title: event.title,
      source: 'manual', project: event.project, count: event.count,
      visibility: event.visibility, timePrecision: event.timePrecision || 'day',
    }));
}

export function buildActivityFeed(posts: BlogPost[]): ActivityItem[] {
  const publishedPosts: ActivityItem[] = posts
    .filter(post => !post.data.draft)
    .map(post => ({
      date: shanghaiDateKey(post.data.date),
      type: 'writing',
      title: `发布《${post.data.title}》`,
      source: 'blog',
    }));

  const events = activityHistory.events as HistoryEvent[];
  const githubActivities = aggregateHistory(events);
  const manualActivities = manualHistoryItems(events);
  const combined: ActivityItem[] = [
    ...manualActivities,
    ...publishedPosts,
    ...githubActivities,
  ];

  const seen = new Set<string>();
  return combined
    .filter(item => {
      const key = `${item.date}\u0000${item.type}\u0000${item.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function countActivitiesByDay(feed: ActivityItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of feed) {
    const weight = Math.max(1, Number(item.count) || 1);
    counts.set(item.date, (counts.get(item.date) || 0) + weight);
  }
  return counts;
}

export function buildHeatmapDays(feed: ActivityItem[], now = new Date()) {
  const counts = countActivitiesByDay(feed);
  const todayKey = shanghaiDateKey(now);
  const today = new Date(`${todayKey}T00:00:00Z`);
  const start = new Date(today);
  start.setUTCDate(today.getUTCDate() - 364 - today.getUTCDay());

  const days = Array.from({ length: 371 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { key, count: counts.get(key) || 0 };
  });

  return { days, activeDays: counts.size };
}
