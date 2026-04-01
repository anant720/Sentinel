import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const normalizedDir = __dirname;

const srcDir = path.resolve(normalizedDir, '..', 'src', 'db', 'migrations');
const distDir = path.resolve(normalizedDir, '..', 'dist', 'db', 'migrations');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

if (fs.existsSync(srcDir)) {
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.sql'));
  for (const file of files) {
    fs.copyFileSync(path.join(srcDir, file), path.join(distDir, file));
    console.log(`Copied ${file} to dist/db/migrations`);
  }
}
