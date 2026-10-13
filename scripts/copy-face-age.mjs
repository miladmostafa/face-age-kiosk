import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules', 'face-age', 'dist');
const target = path.join(root, 'src', 'renderer', 'public', 'vendor', 'face-age');

if (!existsSync(path.join(source, 'faceage.js'))) {
  console.error('face-age is not installed. Run: npm install face-age@latest');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(path.dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });
console.log('Copied face-age dist to src/renderer/public/vendor/face-age');
