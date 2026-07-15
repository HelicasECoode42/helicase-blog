import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writePublicModule } from './public-data.mjs';

const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const statePath = path('../.helicase/studio-state.json');
const activitiesPath = path('../src/data/activities.json');
const inspirationsPath = path('../src/data/inspirations.json');
const activitiesModulePath = path('../src/data/activities.ts');
const inspirationsModulePath = path('../src/data/inspirations.ts');
const state = JSON.parse(await readFile(statePath, 'utf8'));
const activities = JSON.parse(await readFile(activitiesPath, 'utf8'));
const inspirations = JSON.parse(await readFile(inspirationsPath, 'utf8'));
let published = 0;

for (const item of state.captures.filter(item => item.status === 'approved')) {
  const date = item.createdAt.slice(0, 10);
  if (item.type === 'idea') inspirations.unshift({ id: item.id, title: item.text.slice(0, 48), note: item.text, kind: 'capture', date, tags: [] });
  else if (['progress', 'learning'].includes(item.type)) activities.unshift({ date, type: item.type, title: item.text, visibility: 'public' });
  else { console.warn(`Skipped ${item.type} ${item.id}: manual review required.`); continue; }
  item.status = 'published'; published += 1;
}

await writeFile(activitiesPath, `${JSON.stringify(activities, null, 2)}\n`);
await writeFile(inspirationsPath, `${JSON.stringify(inspirations, null, 2)}\n`);
await writePublicModule(activitiesModulePath, activities);
await writePublicModule(inspirationsModulePath, inspirations);
await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
console.log(`Published ${published} approved capture(s).`);
