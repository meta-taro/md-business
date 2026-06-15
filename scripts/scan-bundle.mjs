#!/usr/bin/env node
/**
 * Bundle scan — fail if any CSP-unsafe construct survives into a built bundle.
 *
 * Chrome MV3 forbids `unsafe-eval`, so any bundled `eval(` / `new Function(` /
 * naked `Function(` from a transitive dep makes the extension reject script
 * execution at runtime. tsc / vitest cannot see this; only a post-build scan
 * of the actual bundled JS catches it.
 *
 * Scope: every `dist/**\/*.js` under `apps/*` (browser-bound). Source files,
 * source maps, and node_modules are ignored.
 *
 * Exit codes: 0 = clean. 1 = unsafe construct found. 2 = no bundles found
 * (likely the caller forgot to `pnpm build` first).
 */
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const APPS_DIR = resolve(REPO_ROOT, 'apps');

const UNSAFE_PATTERNS = [
  { name: 'eval(', re: /\beval\s*\(/g },
  { name: 'new Function(', re: /\bnew\s+Function\s*\(/g },
  // Naked Function() with at least one string-literal argument — heuristic for
  // dynamic code construction. Static `Function.prototype` references are fine.
  { name: 'Function("...")', re: /\bFunction\s*\(\s*['"`]/g },
  // Raw CommonJS `require("...")` surviving into a browser bundle — Ajv
  // standalone codegen leaks these for ucs2length / ajv-formats helpers even
  // with esm:true, and the browser has no `require` global so it throws at
  // load time. Caught here so the standalone post-process is enforced.
  { name: 'require("...")', re: /\brequire\s*\(\s*['"`]/g },
];

function listJsFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'chunks-temp') continue;
      listJsFiles(full, acc);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

function collectAppBundles() {
  if (!existsSync(APPS_DIR)) return [];
  const apps = readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const files = [];
  for (const app of apps) {
    const dist = resolve(APPS_DIR, app, 'dist');
    if (!existsSync(dist) || !statSync(dist).isDirectory()) continue;
    files.push(...listJsFiles(dist));
  }
  return files;
}

const files = collectAppBundles();
if (files.length === 0) {
  console.error('[scan-bundle] no apps/*/dist/**/*.js found — run `pnpm build` first.');
  process.exit(2);
}

/**
 * Skip matches that obviously cannot execute: line comments, block-comment
 * continuation lines, and matches sitting immediately after a string-literal
 * quote (e.g. `someProp.code = 'require(...)'`). Heuristic — not a tokenizer —
 * but sufficient for the bundles we ship: any real call site has whitespace or
 * an operator before the keyword, never a quote.
 */
function isInsideStringOrComment(src, matchIndex) {
  const lineStart = src.lastIndexOf('\n', matchIndex - 1) + 1;
  const linePrefix = src.slice(lineStart, matchIndex);
  if (/^\s*(\/\/|\*)/.test(linePrefix)) return true;
  const prev = src[matchIndex - 1];
  if (prev === "'" || prev === '"' || prev === '`') return true;
  return false;
}

const findings = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const { name, re } of UNSAFE_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(src)) !== null) {
      if (isInsideStringOrComment(src, match.index)) continue;
      const before = src.slice(0, match.index);
      const line = before.split('\n').length;
      findings.push({ file, line, name, snippet: src.slice(match.index, match.index + 60) });
    }
  }
}

if (findings.length === 0) {
  console.log(`[scan-bundle] OK — scanned ${files.length} bundled JS file(s), no eval / new Function found.`);
  process.exit(0);
}

console.error(`[scan-bundle] FAIL — ${findings.length} CSP-unsafe construct(s) found:`);
const rel = (p) => p.replace(REPO_ROOT + '\\', '').replace(REPO_ROOT + '/', '');
for (const f of findings) {
  console.error(`  ${rel(f.file)}:${f.line}  [${f.name}]  ${f.snippet.replace(/\n/g, ' ')}`);
}
console.error('\nChrome MV3 rejects `unsafe-eval`. Replace or shim the offending dep,');
console.error('or vendor a CSP-safe alternative before pushing.');
process.exit(1);
