#!/usr/bin/env node
// CHANGELOG.md から、指定したバージョンの節だけを取り出す。
// GitHub Releases の本文に流し込むために使う（リリースのたびに本文を手で書き写さないため）。
//
//   node scripts/release-notes.mjs apps/desktop/CHANGELOG.md v0.4.0
//
// 該当する節が無ければ何も出力せず、終了コード 0 で終わる（リリース自体は止めない）。

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** `v0.4.0` のようなタグ名から先頭の `v` を落とす。 */
export function normalizeVersion(tag) {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

/**
 * CHANGELOG 本文から `## <version>` の節の中身を返す（見出し行は含めない）。
 * 見つからなければ空文字列。
 */
export function extractReleaseNotes(changelog, tag) {
  const version = normalizeVersion(tag);
  const lines = changelog.split(/\r?\n/);

  // `## 0.4.0` を探しているときに `## 0.4.0-rc.1` を拾わないよう、見出し文字列は完全一致で見る。
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return '';

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = end === -1 ? rest : rest.slice(0, end);

  return body.join('\n').trim();
}

async function main() {
  const [changelogPath, tag] = process.argv.slice(2);
  if (!changelogPath || !tag) {
    process.stderr.write('usage: node scripts/release-notes.mjs <changelog-path> <tag>\n');
    process.exit(2);
  }

  const changelog = await readFile(changelogPath, 'utf8');
  const notes = extractReleaseNotes(changelog, tag);
  if (!notes) {
    process.stderr.write(`no changelog section for ${tag} in ${changelogPath}\n`);
    return;
  }

  process.stdout.write(`${notes}\n`);
}

// テストから import されたときは実行しない。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
