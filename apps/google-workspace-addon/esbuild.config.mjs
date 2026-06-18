import { build, context } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, 'src');
const DIST = resolve(__dirname, 'dist');
const WATCH = process.argv.includes('--watch');

/**
 * Apps Script は ES module を直接実行できず、global function だけが trigger 入口となる。
 * Why: esbuild に IIFE 出力させ globalName=mdb の下に export を集約、footer で
 *      Apps Script が呼ぶ top-level function を1行ずつ手書きする。
 */
const TRIGGER_NAMES = [
  'onHomepage',
  'onOpen',
  'onInstall',
  'showSidebar',
  'getSidebarHtml',
  'importMarkdownTableToActiveSheet',
  'exportActiveSheetToMarkdown',
  'setupTestSpecSheet',
  'validateActiveTestSpecSheet',
  'exportTestSpecMarkdown',
  'setGithubPat',
  'clearGithubPat',
  'hasGithubPat',
  'installTestSpecAutoSync',
  'uninstallTestSpecAutoSync',
  'handleTestSpecEdit',
  'flushPendingTestSpecSync',
  'getTestSpecAutoSyncStatus',
];
const footer = TRIGGER_NAMES.map((name) => `function ${name}(e){return mdb.${name}(e);}`).join('\n');

const buildOptions = {
  entryPoints: [resolve(SRC, 'main.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'mdb',
  platform: 'neutral',
  target: 'es2020',
  outfile: resolve(DIST, 'Code.js'),
  footer: { js: footer },
  logLevel: 'info',
};

async function copyStaticAssets() {
  if (!existsSync(DIST)) {
    await mkdir(DIST, { recursive: true });
  }
  await copyFile(resolve(__dirname, 'appsscript.json'), resolve(DIST, 'appsscript.json'));
  const sidebar = await readFile(resolve(SRC, 'sidebar.html'), 'utf8');
  await writeFile(resolve(DIST, 'Sidebar.html'), sidebar, 'utf8');
}

await copyStaticAssets();

if (WATCH) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('esbuild watch started');
} else {
  await build(buildOptions);
}
