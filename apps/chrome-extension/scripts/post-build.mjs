#!/usr/bin/env node
// Post-Vite-build housekeeping:
// - Copy invoice.css from @md-business/renderer-pdf into dist/styles/
// - Copy paged.js polyfill into dist/vendor/ (so MV3 CSP allows loading)
// - Copy the manifest already lives in public/ → dist/ via Vite's publicDir

import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const require = createRequire(import.meta.url);

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function copyInvoiceCss() {
  const src = resolve(
    ROOT,
    '..',
    '..',
    'packages',
    'renderer-pdf',
    'src',
    'styles',
    'invoice.css',
  );
  const destDir = resolve(DIST, 'styles');
  await ensureDir(destDir);
  await copyFile(src, resolve(destDir, 'invoice.css'));
  console.log('[post-build] copied invoice.css');
}

async function copyPagedJs() {
  const pkgEntry = require.resolve('pagedjs');
  const pkgDir = dirname(pkgEntry);
  const candidates = [
    resolve(pkgDir, 'paged.polyfill.js'),
    resolve(pkgDir, '..', 'dist', 'paged.polyfill.js'),
    resolve(pkgDir, '..', 'paged.polyfill.js'),
  ];
  const destDir = resolve(DIST, 'vendor');
  await ensureDir(destDir);
  for (const c of candidates) {
    if (existsSync(c)) {
      await copyFile(c, resolve(destDir, 'paged.polyfill.js'));
      console.log(`[post-build] copied paged.polyfill.js from ${c}`);
      return;
    }
  }
  // Fallback: dump the contents of the pagedjs dist dir to help the user diagnose.
  const distDir = resolve(pkgDir, '..', 'dist');
  if (existsSync(distDir)) {
    const files = await readdir(distDir);
    console.warn('[post-build] paged.polyfill.js not located. dist/:', files.join(', '));
  }
  console.warn('[post-build] WARNING: paged.polyfill.js not copied — viewer pagination may regress to browser print.');
}

await copyInvoiceCss();
await copyPagedJs();
console.log('[post-build] done.');
