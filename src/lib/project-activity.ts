import activityHistory from '../data/activity-history.json';
import { shanghaiDateKey } from './activity-feed';

interface ProjectActivitySource {
  githubRepos?: string[];
}

interface GitHubHistoryEvent {
  id: string;
  occurredAt: string;
  source: string;
  repository?: string;
  project?: string;
  kind?: string;
  action?: string;
  title?: string;
  url?: string;
  count: number;
  visibility: string;
}

export interface ProjectActivityStats {
  lastActivityAt: string | null;
  lastActivityDate: string | null;
  last7Days: number;
  last30Days: number;
  activitySeries: Array<[string, number]>;
}

export interface ProjectHistoryItem {
  id: string;
  occurredAt: string;
  repository: string;
  kind: string;
  action: string;
  title: string;
  url: string;
  count: number;
}

export function getProjectActivity(project: ProjectActivitySource, now = new Date()): ProjectActivityStats {
  const repositories = new Set(project.githubRepos || []);
  const events = (activityHistory.events as GitHubHistoryEvent[])
    .filter(event => event.source === 'github'
      && event.visibility === 'public'
      && !!event.repository
      && repositories.has(event.repository)
      && Number.isFinite(Date.parse(event.occurredAt)))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const nowMs = now.getTime();
  const countSince = (days: number) => {
    const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
    return events.reduce((total, event) => {
      const occurredAt = Date.parse(event.occurredAt);
      return occurredAt >= cutoff && occurredAt <= nowMs
        ? total + Math.max(1, Number(event.count) || 1)
        : total;
    }, 0);
  };

  const latest = events[0]?.occurredAt || null;
  return {
    lastActivityAt: latest,
    lastActivityDate: latest ? shanghaiDateKey(latest) : null,
    last7Days: countSince(7),
    last30Days: countSince(30),
    activitySeries: events.map(event => [event.occurredAt, Math.max(1, Number(event.count) || 1)]),
  };
}

export function getProjectHistory(project: ProjectActivitySource, limit = 8): ProjectHistoryItem[] {
  const repositories = new Set(project.githubRepos || []);
  return (activityHistory.events as GitHubHistoryEvent[])
    .filter(event => event.source === 'github'
      && event.visibility === 'public'
      && !!event.repository
      && repositories.has(event.repository)
      && Number.isFinite(Date.parse(event.occurredAt)))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit)
    .map(event => ({
      id: event.id,
      occurredAt: event.occurredAt,
      repository: event.repository || '',
      kind: event.kind || 'activity',
      action: event.action || 'updated',
      title: event.title || '',
      url: event.url || `https://github.com/${event.repository}`,
      count: Math.max(1, Number(event.count) || 1),
    }));
}
