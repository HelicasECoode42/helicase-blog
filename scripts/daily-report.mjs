import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shanghaiDate = value => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(value);
const requestedDate = process.argv[2] || shanghaiDate(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) throw new Error('Date must use YYYY-MM-DD.');
const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const history = JSON.parse(await readFile(path('../src/data/activity-history.json'), 'utf8'));
const dailyRoot = path('../.helicase/daily/');
const contextRoot = path('../.helicase/daily-context/');
const reportPath = join(dailyRoot, `${requestedDate}.md`);
const contextPath = join(contextRoot, `${requestedDate}.md`);
const events = history.events.filter(event => event.visibility === 'public' && shanghaiDate(new Date(event.occurredAt)) === requestedDate);

function shanghaiTime(value) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(value);
}

function labelFor(event) {
  if (event.kind === 'push') return `${event.count} 个提交`;
  if (event.kind === 'pull_request') return `PR ${event.action}`;
  if (event.kind === 'issue') return `Issue ${event.action}`;
  if (event.kind === 'discussion') return '讨论评论';
  if (event.kind === 'release') return `发布 ${event.action}`;
  if (event.kind === 'summary') return '历史摘要';
  return `${event.kind} ${event.action}`;
}

function detailFor(event) {
  const title = String(event.title || '').trim();
  const target = title || String(event.repository || event.project || '').trim() || '未命名活动';
  const url = String(event.url || '').trim();
  return `${shanghaiTime(new Date(event.occurredAt))} · ${labelFor(event)}：${target}${url ? ` (${url})` : ''}`;
}

const buckets = new Map();
for (const event of events) {
  if (!buckets.has(event.project)) buckets.set(event.project, { commits: 0, prs: 0, issues: 0, discussions: 0, releases: 0, manual: [], details: [] });
  const bucket = buckets.get(event.project);
  if (event.source === 'manual') bucket.manual.push(event.title);
  else if (event.kind === 'push') bucket.commits += event.count;
  else if (event.kind === 'pull_request') bucket.prs += event.count;
  else if (event.kind === 'issue') bucket.issues += event.count;
  else if (event.kind === 'discussion') bucket.discussions += event.count;
  else if (event.kind === 'release') bucket.releases += event.count;
  bucket.details.push(detailFor(event));
}
const evidenceLines = [];
for (const [project, bucket] of buckets) {
  const parts = [];
  if (bucket.commits) parts.push(`${bucket.commits} 个提交`);
  if (bucket.prs) parts.push(`${bucket.prs} 个 PR 动作`);
  if (bucket.issues) parts.push(`${bucket.issues} 个 Issue 动作`);
  if (bucket.discussions) parts.push(`${bucket.discussions} 次讨论`);
  if (bucket.releases) parts.push(`${bucket.releases} 次发布`);
  if (parts.length) evidenceLines.push(`- ${project}：${parts.join('，')}`);
  for (const title of bucket.manual) evidenceLines.push(`- ${project}：${title}`);
  for (const detail of bucket.details) evidenceLines.push(`  - ${detail}`);
}
if (!evidenceLines.length) evidenceLines.push('- 当天没有采集到公开活动。');
let context = '';
try { context = (await readFile(contextPath, 'utf8')).trim(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const evidence = `<!-- AUTO:EVIDENCE:START -->\n${evidenceLines.join('\n')}\n\n### 主动纳入的 Codex / 本地工作摘要\n\n${context || '- 暂无。只有你明确加入的摘要才会出现在这里。'}\n<!-- AUTO:EVIDENCE:END -->`;

await mkdir(dailyRoot, { recursive: true, mode: 0o700 });
let report = '';
try { report = await readFile(reportPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const existed = Boolean(report);
if (report) {
  if (!report.includes('<!-- AUTO:EVIDENCE:START -->') || !report.includes('<!-- AUTO:EVIDENCE:END -->')) throw new Error('Existing report has no safe evidence markers; refusing to overwrite it.');
  report = report.replace(/<!-- AUTO:EVIDENCE:START -->[\s\S]*?<!-- AUTO:EVIDENCE:END -->/, evidence);
} else {
  report = `---\ndate: ${requestedDate}\nstatus: drafted\nprivacy: private\n---\n\n# ${requestedDate} 日报\n\n## 今日证据\n\n${evidence}\n\n## 我的心得\n\n<!-- 这里由你写：感受、判断、犹豫，以及今天真正意味着什么。 -->\n\n## Codex 复盘\n\n<!-- 你写完心得后，再让 Codex 基于整份日报复盘：有效做法、重复摩擦、明天最小下一步。 -->\n\n## 公开候选\n\n<!-- PUBLIC:START\n标题：\n摘要：\n标签：随笔, 日报\n正文：\nPUBLIC:END -->\n`;
}
const temporary = `${reportPath}.${process.pid}.tmp`;
await writeFile(temporary, report, { encoding: 'utf8', mode: 0o600 });
await rename(temporary, reportPath);
console.log(`${existed ? 'Refreshed' : 'Created'} private daily report: ${reportPath}`);
