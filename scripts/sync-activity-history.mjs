import { open, readFile, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomically } from './public-data.mjs';

const RETENTION_DAYS = 400;
const LOCK_MAX_AGE_MS = 15 * 60 * 1000;
const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const historyPath = path('../src/data/activity-history.json');
const config = JSON.parse(await readFile(path('../src/data/integrations.json'), 'utf8'));
const lockPath = join(tmpdir(), 'helicase-blog-activity-history.lock');

function compact(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function projectFor(event) {
  const repository = compact(event.repo?.name || '');
  return compact(config.github.repositoryAliases?.[repository]
    || repository.replace(`${config.github.username}/`, '')) || 'GitHub';
}

function githubUrl(event, fallback = '') {
  return compact(fallback || (event.repo?.name ? `https://github.com/${event.repo.name}` : ''), 500);
}

function normalizeGithubEvent(event) {
  const base = {
    id: `github:${event.id}`,
    occurredAt: new Date(event.created_at).toISOString(),
    source: 'github',
    project: projectFor(event),
    repository: compact(event.repo?.name || '', 200),
    visibility: 'public',
  };

  if (event.type === 'PushEvent') {
    const commits = Array.isArray(event.payload?.commits) ? event.payload.commits : [];
    return {
      ...base, kind: 'push', action: 'created',
      count: Number(event.payload?.distinct_size || event.payload?.size || commits.length || 1),
      title: compact(commits.map(commit => commit.message).filter(Boolean).join('；')),
      url: githubUrl(event),
    };
  }

  if (event.type === 'PullRequestEvent') {
    const pullRequest = event.payload?.pull_request;
    const action = event.payload?.action === 'closed' && pullRequest?.merged
      ? 'merged' : compact(event.payload?.action || 'updated', 40);
    return {
      ...base, kind: 'pull_request', action, count: 1,
      title: compact(pullRequest?.title),
      url: githubUrl(event, pullRequest?.html_url),
    };
  }

  if (event.type === 'IssuesEvent') {
    const issue = event.payload?.issue;
    return {
      ...base, kind: 'issue', action: compact(event.payload?.action || 'updated', 40), count: 1,
      title: compact(issue?.title),
      url: githubUrl(event, issue?.html_url),
    };
  }

  if (event.type === 'IssueCommentEvent') {
    const issue = event.payload?.issue;
    return {
      ...base, kind: 'discussion', action: 'commented', count: 1,
      title: compact(issue?.title),
      url: githubUrl(event, event.payload?.comment?.html_url || issue?.html_url),
    };
  }

  if (event.type === 'ReleaseEvent') {
    const release = event.payload?.release;
    return {
      ...base, kind: 'release', action: compact(event.payload?.action || 'published', 40), count: 1,
      title: compact(release?.name || release?.tag_name || '新版本'),
      url: githubUrl(event, release?.html_url),
    };
  }

  return null;
}

function validateEvent(event) {
  if (!event || typeof event !== 'object') throw new Error('History contains a non-object event.');
  for (const field of ['id', 'occurredAt', 'source', 'project', 'kind', 'action', 'visibility']) {
    if (typeof event[field] !== 'string' || !event[field]) throw new Error(`Invalid ${field} in ${event.id || 'unknown event'}.`);
  }
  if (!Number.isFinite(Date.parse(event.occurredAt))) throw new Error(`Invalid occurredAt in ${event.id}.`);
  if (!Number.isInteger(event.count) || event.count < 1) throw new Error(`Invalid count in ${event.id}.`);
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function acquireLock() {
  try {
    const handle = await open(lockPath, 'wx');
    await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
    return handle;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const lockStat = await stat(lockPath);
    if (Date.now() - lockStat.mtimeMs <= LOCK_MAX_AGE_MS) {
      throw new Error(`Activity history sync is already running (${lockPath}).`);
    }
    await unlink(lockPath);
    return acquireLock();
  }
}

const lock = await acquireLock();
try {
  const current = await readJson(historyPath, { version: 1, retentionDays: RETENTION_DAYS, events: [] });
  if (current.version !== 1 || !Array.isArray(current.events)) throw new Error('Unsupported activity history schema.');

  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'helicase-activity-history' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/users/${config.github.username}/events/public?per_page=100`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub history sync failed: ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('GitHub history sync returned an invalid payload.');

  const fetched = payload.filter(event => event?.id && event?.created_at).map(normalizeGithubEvent).filter(Boolean);
  const byId = new Map(current.events.map(event => [event.id, event]));
  for (const event of fetched) byId.set(event.id, event);

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const events = [...byId.values()]
    .filter(event => Date.parse(event.occurredAt) >= cutoff)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  for (const event of events) validateEvent(event);
  if (new Set(events.map(event => event.id)).size !== events.length) throw new Error('Duplicate activity IDs detected.');

  const next = { version: 1, retentionDays: RETENTION_DAYS, events };
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  const previous = await readFile(historyPath, 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error));
  if (serialized === previous) console.log(`No activity history changes (${events.length} retained events).`);
  else {
    await writeJsonAtomically(historyPath, next);
    console.log(`Activity history updated: ${fetched.length} fetched, ${events.length} retained.`);
  }
} finally {
  await lock.close();
  await unlink(lockPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
