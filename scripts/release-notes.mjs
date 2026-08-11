#!/usr/bin/env node
// CHANGELOG から、指定したバージョンの節だけを取り出す。
// GitHub Releases の本文に流し込むために使う（リリースのたびに本文を手で書き写さないため）。
//
//   node scripts/release-notes.mjs v0.4.0 apps/desktop/CHANGELOG.md apps/desktop/CHANGELOG.en.md
//
// CHANGELOG を複数渡すと、目印を挟んで 1 本にまとめる。Release の本文は 1 つしか持てないが、
// アプリ側はこの目印で表示言語のぶんだけを取り出す。
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

/**
 * 言語ごとの本文を、目印を挟んで 1 本にする（1 本目が日本語、2 本目が英語）。
 * 空の本文は目印ごと落とす。目印だけあって中身が無いと、その言語の利用者に空の本文が出る。
 */
export function joinLocaleNotes([ja = '', en = '']) {
  const parts = [ja.trim()];
  if (en.trim()) parts.push('<!-- lang:en -->', en.trim());
  return parts.filter(Boolean).join('\n\n');
}

async function main() {
  const [tag, ...changelogPaths] = process.argv.slice(2);
  if (!tag || changelogPaths.length === 0) {
    process.stderr.write('usage: node scripts/release-notes.mjs <tag> <changelog-path...>\n');
    process.exit(2);
  }

  const sections = [];
  for (const path of changelogPaths) {
    const notes = extractReleaseNotes(await readFile(path, 'utf8'), tag);
    if (!notes) process.stderr.write(`no changelog section for ${tag} in ${path}\n`);
    sections.push(notes);
  }

  const body = joinLocaleNotes(sections);
  if (!body) return;

  process.stdout.write(`${body}\n`);
}

// テストから import されたときは実行しない。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
