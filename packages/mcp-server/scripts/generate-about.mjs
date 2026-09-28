#!/usr/bin/env node
/**
 * 変更履歴を src/generated/releases.ts へ焼き込む。
 *
 * このサーバーは繋いだ先のフォルダで動くので、実行時に CHANGELOG.md を読みに行けない
 * （md-business のリポジトリが手元にあるとは限らない）。ビルド時に取り込むほかない。
 *
 *   node scripts/generate-about.mjs          焼き込み直す
 *   node scripts/generate-about.mjs --check  焼き込みが古くなっていないか見る（書き換えない）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(HERE, '..');
const REPO_ROOT = join(PKG_ROOT, '..', '..');
const OUT_PATH = join(PKG_ROOT, 'src', 'generated', 'releases.ts');

/**
 * 焼き込む版の数。全部入れると机上のアプリに埋める 1 本のファイルが CHANGELOG と同じ速さで
 * 太り続ける（デスクトップの分だけで 70KB 超）。古い版は GitHub の一覧を見てもらう。
 */
const EMBED_LIMIT = 5;

const APPS = [
  { id: 'desktop', dir: 'apps/desktop' },
  { id: 'chrome-extension', dir: 'apps/chrome-extension' },
  { id: 'workspace-addon', dir: 'apps/google-workspace-addon' },
];

/**
 * `## <版>` の行で切る。``` で囲まれた中の `## ` は見出しではないので飛ばす。
 */
function parseChangelog(markdown) {
  const lines = markdown.split(/\r?\n/);
  const entries = [];
  let current = null;
  let fence = null;

  for (const line of lines) {
    const fenceMark = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMark) {
      const mark = fenceMark[1][0];
      if (fence === null) fence = mark;
      else if (fence === mark) fence = null;
    }

    if (fence === null && line.startsWith('## ')) {
      const heading = line.slice(3).trim();
      // 見出しには `0.1.0（未公開）` のように但し書きが付く。版そのものだけを取る。
      const version = /^v?(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)/.exec(heading)?.[1];
      if (version) {
        current = { version, notes: [] };
        entries.push(current);
        continue;
      }
    }

    if (current) current.notes.push(line);
  }

  return entries.map((e) => ({ version: e.version, notes: e.notes.join('\n').trim() }));
}

function collect() {
  const data = {};
  for (const app of APPS) {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, app.dir, 'package.json'), 'utf8'));
    const all = parseChangelog(readFileSync(join(REPO_ROOT, app.dir, 'CHANGELOG.md'), 'utf8'));
    data[app.id] = {
      version: pkg.version,
      hasOlder: all.length > EMBED_LIMIT,
      releases: all.slice(0, EMBED_LIMIT),
    };
  }
  return data;
}

function render(data) {
  const body = APPS.map((app) => {
    const a = data[app.id];
    const releases = a.releases
      .map((r) => `    { version: ${JSON.stringify(r.version)}, notes: ${JSON.stringify(r.notes)} },`)
      .join('\n');
    return [
      `  ${JSON.stringify(app.id)}: {`,
      `    version: ${JSON.stringify(a.version)},`,
      `    hasOlder: ${a.hasOlder},`,
      `    releases: [`,
      releases,
      `    ],`,
      `  },`,
    ].join('\n');
  }).join('\n');

  return [
    '// 自動生成。手で書き換えない。',
    '// 作り直す: node scripts/generate-about.mjs（古いまま commit すると releasesGenerated.test.ts が落ちる）',
    "import type { EmbeddedReleases } from '../about.js';",
    '',
    'export const EMBEDDED_RELEASES: EmbeddedReleases = {',
    body,
    '};',
    '',
  ].join('\n');
}

const rendered = render(collect());

if (process.argv.includes('--check')) {
  let current = null;
  try {
    current = readFileSync(OUT_PATH, 'utf8');
  } catch {
    console.error(`焼き込みがまだありません: ${OUT_PATH}`);
    process.exit(1);
  }
  if (current !== rendered) {
    console.error(
      '焼き込んだ変更履歴が CHANGELOG と食い違っています。node scripts/generate-about.mjs で作り直してください。',
    );
    process.exit(1);
  }
  process.exit(0);
}

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, rendered);
console.log(`焼き込みました: ${OUT_PATH}`);
