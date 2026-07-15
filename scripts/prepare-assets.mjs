import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const vendorDir = fileURLToPath(new URL('../public/vendor/', import.meta.url));
const threeSource = fileURLToPath(new URL('../node_modules/three/build/three.module.min.js', import.meta.url));
const threeTarget = fileURLToPath(new URL('../public/vendor/three.module.min.js', import.meta.url));

await mkdir(vendorDir, { recursive: true });
await copyFile(threeSource, threeTarget);
console.log('Prepared self-hosted browser assets.');
