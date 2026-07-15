import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writePublicModule } from './public-data.mjs';

const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const config = JSON.parse(await readFile(path('../src/data/integrations.json'), 'utf8'));
const output = [];
const safeUser = value => /^[a-zA-Z0-9-]{1,39}$/.test(value || '');

if (config.github.enabled && safeUser(config.github.username)) {
  const response = await fetch(`https://api.github.com/users/${config.github.username}/events/public?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'helicase-static-sync' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub sync failed: ${response.status}`);
  for (const event of await response.json()) {
    if (!event.created_at || !event.type) continue;
    output.push({ date: event.created_at.slice(0, 10), type: 'github', title: event.type.replace(/Event$/, ''), source: 'github' });
  }
}

// LeetCode has no stable official public activity API. Keep the adapter opt-in and
// record only the public submission calendar returned by its GraphQL endpoint.
if (config.leetcode.enabled && safeUser(config.leetcode.username)) {
  const response = await fetch('https://leetcode.com/graphql', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'helicase-static-sync' },
    body: JSON.stringify({ query: 'query calendar($username: String!) { matchedUser(username: $username) { submissionCalendar } }', variables: { username: config.leetcode.username } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`LeetCode sync failed: ${response.status}`);
  const raw = (await response.json()).data?.matchedUser?.submissionCalendar;
  for (const [unix, count] of Object.entries(JSON.parse(raw || '{}'))) {
    output.push({ date: new Date(Number(unix) * 1000).toISOString().slice(0, 10), type: 'leetcode', title: `${count} accepted/submitted`, source: 'leetcode', count: Number(count) });
  }
}

await writeFile(path('../src/data/external-activities.json'), `${JSON.stringify(output, null, 2)}\n`);
await writePublicModule(path('../src/data/external-activities.ts'), output);
console.log(`Synced ${output.length} external activity records.`);
