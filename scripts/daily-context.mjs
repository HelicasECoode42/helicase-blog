import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shanghaiDate = value => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(value);
const args = process.argv.slice(2);
const explicitDate = /^\d{4}-\d{2}-\d{2}$/.test(args[0] || '') ? args.shift() : null;
const date = explicitDate || shanghaiDate(new Date());
const text = args.join(' ').replace(/\s+/g, ' ').trim();
if (!text || text.length > 2000) {
  console.error('Usage: npm run daily:add-context -- [YYYY-MM-DD] "summary explicitly approved for the private daily report"');
  process.exit(1);
}
const root = fileURLToPath(new URL('../.helicase/daily-context/', import.meta.url));
await mkdir(root, { recursive: true, mode: 0o700 });
await appendFile(join(root, `${date}.md`), `- ${new Date().toISOString()} · ${text}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(`Added explicit private context for ${date}.`);
