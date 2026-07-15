import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writePublicModule } from './public-data.mjs';

const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const state = JSON.parse(await readFile(path('../.helicase/studio-state.json'), 'utf8'));
if (!state.profile) throw new Error('No local profile draft. Save it in Studio first.');

const profile = state.profile;
const text = (value, label, max) => {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} must contain 1-${max} characters.`);
  return normalized;
};
const safeUrl = (value, label, { allowLocal = false } = {}) => {
  const normalized = text(value, label, 500);
  if (allowLocal && /^\/images\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(normalized)) return normalized;
  let parsed;
  try { parsed = new URL(normalized); } catch { throw new Error(`${label} must be an https URL${allowLocal ? ' or /images/... path' : ''}.`); }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use https.`);
  return parsed.href;
};
if (!Array.isArray(profile.socials) || profile.socials.length > 12) throw new Error('socials must be an array with at most 12 entries.');

const publicProfile = {
  avatar: safeUrl(profile.avatar, 'avatar', { allowLocal: true }),
  name: text(profile.name, 'name', 48),
  bio: text(profile.bio, 'bio', 140),
  socials: profile.socials.map((social, index) => ({
    label: text(social?.label, `socials[${index}].label`, 32),
    url: safeUrl(social?.url, `socials[${index}].url`),
  })),
};

await writePublicModule(path('../src/data/profile.ts'), publicProfile);
console.log('Published profile data. Run npm run verify before deployment.');
