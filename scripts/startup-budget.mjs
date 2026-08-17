#!/usr/bin/env node
/**
 * Startup budget — fail if the desktop app loads too much JS before first paint.
 *
 * The window appears only after the JS referenced from `index.html` has been
 * fetched, parsed and executed. Anything reachable from that entry graph is
 * paid for on every launch, whether or not the user ever opens a document.
 *
 * The check is a byte count, not a stopwatch. Wall-clock startup depends on the
 * machine, so a time threshold is either meaningless or flaky; the number of
 * bytes the entry graph pulls in is a property of the build alone and reproduces
 * anywhere.
 *
 * What it protects: document rendering (schema validators, the PDF renderer, the
 * Markdown pipeline) must stay behind a dynamic import. A single static import
 * from a component that is mounted at launch drags all of it back into the entry
 * chunk, and nothing else in the toolchain notices.
 *
 * Exit codes: 0 = within budget. 1 = over budget. 2 = no build found
 * (likely the caller forgot to build the desktop app first).
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BUILD_DIR = resolve(REPO_ROOT, 'apps/desktop/build');

/**
 * Ceiling for JS loaded before first paint.
 *
 * This is not a target to optimise against — it is the line that separates
 * "the shell" from "the shell plus a document renderer". The shell (Svelte
 * runtime, router, UI, translations) sits well under it; any one of the schema
 * validators or the PDF renderer re-entering the entry graph pushes it over.
 */
const BUDGET_BYTES = 400 * 1024;

const LINK_TAG = /<link\b[^>]*>/gi;
const HREF_ATTR = /href=["']([^"']+)["']/i;
const REL_MODULEPRELOAD = /rel=["']modulepreload["']/i;
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

/**
 * Collect every JS file `index.html` causes the browser to fetch at load:
 * `modulepreload` hints plus the `import()` calls in the bootstrap script.
 * Order is preserved and duplicates are dropped (the entry modules appear in
 * both places).
 */
export function startupScripts(html) {
  const paths = [];
  const seen = new Set();
  const add = (href) => {
    if (!href.endsWith('.js') || seen.has(href)) return;
    seen.add(href);
    paths.push(href);
  };

  for (const tag of html.match(LINK_TAG) ?? []) {
    if (!REL_MODULEPRELOAD.test(tag)) continue;
    const href = tag.match(HREF_ATTR)?.[1];
    if (href) add(href);
  }

  DYNAMIC_IMPORT.lastIndex = 0;
  let match;
  while ((match = DYNAMIC_IMPORT.exec(html)) !== null) add(match[1]);

  return paths;
}

/** Turn an `index.html` href into a path under the build directory. */
export function toBuildPath(buildDir, href) {
  return join(buildDir, href.replace(/^\/+/, ''));
}

/** Total bytes and per-file breakdown, largest first. */
export function summarize(files) {
  const sorted = [...files].sort((a, b) => b.bytes - a.bytes);
  const total = sorted.reduce((sum, file) => sum + file.bytes, 0);
  return { total, files: sorted };
}

export function formatKb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

function main() {
  const indexPath = resolve(BUILD_DIR, 'index.html');
  if (!existsSync(indexPath)) {
    console.error(
      '[startup-budget] apps/desktop/build/index.html not found — run `pnpm --filter @md-business/desktop build` first.',
    );
    process.exit(2);
  }

  const html = readFileSync(indexPath, 'utf8');
  const hrefs = startupScripts(html);
  if (hrefs.length === 0) {
    console.error('[startup-budget] index.html references no JS — the build looks incomplete.');
    process.exit(2);
  }

  const files = [];
  for (const href of hrefs) {
    const file = toBuildPath(BUILD_DIR, href);
    if (!existsSync(file)) {
      console.error(`[startup-budget] referenced but missing: ${href}`);
      process.exit(2);
    }
    files.push({ href, bytes: statSync(file).size });
  }

  const { total, files: sorted } = summarize(files);

  if (total <= BUDGET_BYTES) {
    console.log(
      `[startup-budget] OK — ${formatKb(total)} of JS in ${sorted.length} file(s), budget ${formatKb(BUDGET_BYTES)}.`,
    );
    process.exit(0);
  }

  console.error(
    `[startup-budget] FAIL — ${formatKb(total)} of JS loaded before first paint, budget ${formatKb(BUDGET_BYTES)}.`,
  );
  for (const file of sorted) {
    console.error(`  ${formatKb(file.bytes).padStart(8)}  ${file.href}`);
  }
  console.error('\nSomething mounted at launch is statically importing document rendering');
  console.error('(schema validators / PDF renderer / Markdown pipeline). Move it behind');
  console.error('a dynamic import so it loads when a document is opened instead.');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
