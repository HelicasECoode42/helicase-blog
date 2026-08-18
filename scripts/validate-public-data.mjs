import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const errors = [];
const readJson = async relative => JSON.parse(await readFile(path(relative), 'utf8'));
const isText = (value, max, required = true) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
const isUrl = (value, allowLocal = false) => {
  if (typeof value !== 'string') return false;
  if (allowLocal && /^\/?(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]+)?$/.test(value) && value.startsWith('/')) return true;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return true;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
};

const profile = await readJson('../src/data/profile.json');
if (!profile || typeof profile !== 'object' || !isText(profile.name, 48) || !isText(profile.bio, 140, false) || !isUrl(profile.avatar, true)) {
  errors.push('profile.json: invalid avatar, name, or bio');
}
if (!Array.isArray(profile.socials) || profile.socials.length > 12 || profile.socials.some(item => !isText(item?.label, 32) || !isUrl(item?.url))) {
  errors.push('profile.json: socials must contain at most 12 valid links');
}

const links = await readJson('../src/data/links.json');
if (!Array.isArray(links) || links.length > 100 || links.some(item => !isText(item?.name, 80) || !isText(item?.note, 240, false) || !isUrl(item?.url) || (item?.avatar && !isUrl(item.avatar, true)))) {
  errors.push('links.json: expected an array of valid public links');
}

const projects = await readJson('../src/data/projects.json');
const ids = new Set();
if (!Array.isArray(projects) || projects.length > 100) errors.push('projects.json: expected at most 100 projects');
else for (const [index, project] of projects.entries()) {
  const prefix = `projects.json[${index}]`;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(project?.id || '') || ids.has(project.id)) errors.push(`${prefix}: invalid or duplicate id`);
  ids.add(project?.id);
  for (const field of ['name', 'type', 'summary', 'current', 'next']) {
    if (!isText(project?.[field], field === 'summary' ? 400 : 180)) errors.push(`${prefix}: invalid ${field}`);
  }
  if ('progress' in project) errors.push(`${prefix}: progress percentages require an explicit denominator; use milestone instead`);
  if (!['active', 'paused', 'archived'].includes(project?.status)) errors.push(`${prefix}: invalid status`);
  if (!['exploring', 'building', 'validating', 'maintaining'].includes(project?.phase)) errors.push(`${prefix}: invalid phase`);
  if (!['public', 'private'].includes(project?.visibility)) errors.push(`${prefix}: invalid visibility`);
  if (!Array.isArray(project?.stack) || project.stack.length > 20 || project.stack.some(item => !isText(item, 40))) errors.push(`${prefix}: invalid stack`);
  if (!Array.isArray(project?.githubRepos) || project.githubRepos.length > 20 || project.githubRepos.some(repo => !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))) errors.push(`${prefix}: invalid githubRepos`);
  if (project?.milestone !== undefined && (!isText(project.milestone?.name, 120)
    || !Number.isInteger(project.milestone?.completed) || !Number.isInteger(project.milestone?.total)
    || project.milestone.completed < 0 || project.milestone.total < 1 || project.milestone.completed > project.milestone.total)) {
    errors.push(`${prefix}: invalid milestone`);
  }
  for (const field of ['links', 'notes']) {
    const values = project?.[field] ?? [];
    if (!Array.isArray(values) || values.length > 20 || values.some(item => !isText(item?.label, 100) || !isUrl(item?.url, true))) errors.push(`${prefix}: invalid ${field}`);
  }
}

const inspirations = await readJson('../src/data/inspirations.json');
if (!Array.isArray(inspirations) || inspirations.length > 500) errors.push('inspirations.json: expected at most 500 records');
else {
  const inspirationIds = new Set();
  for (const [index, item] of inspirations.entries()) {
    if (!isText(item?.id, 80) || inspirationIds.has(item.id) || !isText(item?.title, 120) || !isText(item?.note, 1000)
      || !isText(item?.kind, 40) || !isDate(item?.date) || !Array.isArray(item?.tags) || item.tags.some(tag => !isText(tag, 40))) {
      errors.push(`inspirations.json[${index}]: invalid record`);
    }
    inspirationIds.add(item?.id);
  }
}

const history = await readJson('../src/data/activity-history.json');
if (history?.version !== 1 || history?.retentionDays !== 400 || !Array.isArray(history?.events)) errors.push('activity-history.json: unsupported document schema');
else {
  const eventIds = new Set();
  let previous = null;
  for (const [index, event] of history.events.entries()) {
    if (!isText(event?.id, 240) || eventIds.has(event.id) || !Number.isFinite(Date.parse(event?.occurredAt))
      || !isText(event?.source, 80) || !isText(event?.project, 120) || !isText(event?.kind, 60)
      || !isText(event?.action, 60) || !Number.isInteger(event?.count) || event.count < 1
      || !['public', 'private'].includes(event?.visibility) || (event?.timePrecision && !['instant', 'day'].includes(event.timePrecision))
      || (event?.repository !== undefined && !isText(event.repository, 200, false))) {
      errors.push(`activity-history.json.events[${index}]: invalid event`);
    }
    if (previous && previous < event.occurredAt) errors.push(`activity-history.json.events[${index}]: events are not sorted newest first`);
    previous = event?.occurredAt;
    eventIds.add(event?.id);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Public data validation passed (${projects.length} projects, ${inspirations.length} inspirations, ${history.events.length} activities).`);
}
