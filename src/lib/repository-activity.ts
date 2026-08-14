import activityHistory from '../data/activity-history.json';
import integrations from '../data/integrations.json';
import { shanghaiDateKey } from './activity-feed';

interface GitHubEvent {
  occurredAt: string;
  source: string;
  repository?: string;
  kind?: string;
  count: number;
  visibility: string;
}

export interface RepositoryActivity {
  repository: string;
  label: string;
  url: string;
  commits: number;
  actions: number;
  lastActivityAt: string;
  lastActivityDate: string;
}

export function getRecentRepositories(limit = 5, days = 30, now = new Date()): RepositoryActivity[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const repositories = new Map<string, RepositoryActivity>();

  for (const event of activityHistory.events as GitHubEvent[]) {
    if (event.source !== 'github' || event.visibility !== 'public' || !event.repository) continue;
    const occurredAt = Date.parse(event.occurredAt);
    if (!Number.isFinite(occurredAt) || occurredAt < cutoff || occurredAt > now.getTime()) continue;
    const current = repositories.get(event.repository) || {
      repository: event.repository,
      label: integrations.github.repositoryAliases[event.repository as keyof typeof integrations.github.repositoryAliases]
        || event.repository.split('/').at(-1)
        || event.repository,
      url: `https://github.com/${event.repository}`,
      commits: 0,
      actions: 0,
      lastActivityAt: event.occurredAt,
      lastActivityDate: shanghaiDateKey(event.occurredAt),
    };
    current.actions += Math.max(1, Number(event.count) || 1);
    if (event.kind === 'push') current.commits += Math.max(1, Number(event.count) || 1);
    if (event.occurredAt > current.lastActivityAt) {
      current.lastActivityAt = event.occurredAt;
      current.lastActivityDate = shanghaiDateKey(event.occurredAt);
    }
    repositories.set(event.repository, current);
  }

  return [...repositories.values()]
    .filter(repository => repository.commits > 0)
    .sort((a, b) => b.commits - a.commits || b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, limit);
}
