import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractReleaseNotes, normalizeVersion, joinLocaleNotes } from './release-notes.mjs';

const CHANGELOG = `# Changelog

説明の行。

## 未リリース

### 修正

- まだ出していない変更。

## 0.4.0

### 追加

- 新しい機能。

### 修正

- 直したこと。

## 0.3.0

### 追加

- 前の版の機能。
`;

test('タグ名から先頭の v を落とす', () => {
  assert.equal(normalizeVersion('v0.4.0'), '0.4.0');
  assert.equal(normalizeVersion('0.4.0'), '0.4.0');
});

test('指定した版の中身だけを取り出す', () => {
  const notes = extractReleaseNotes(CHANGELOG, 'v0.4.0');
  assert.match(notes, /新しい機能/);
  assert.match(notes, /直したこと/);
  assert.doesNotMatch(notes, /前の版の機能/);
  assert.doesNotMatch(notes, /まだ出していない変更/);
});

test('見出し自体は含めない', () => {
  const notes = extractReleaseNotes(CHANGELOG, 'v0.4.0');
  assert.doesNotMatch(notes, /^## /m);
  assert.match(notes, /^### 追加/m);
});

test('最後の版は末尾まで取り出す', () => {
  const notes = extractReleaseNotes(CHANGELOG, 'v0.3.0');
  assert.match(notes, /前の版の機能/);
  assert.equal(notes.endsWith('前の版の機能。'), true);
});

test('該当する版が無ければ空文字を返す', () => {
  assert.equal(extractReleaseNotes(CHANGELOG, 'v9.9.9'), '');
});

test('日本語と英語を、目印を挟んで 1 本にする', () => {
  // Release の本文は 1 つしか持てない。アプリ側はこの目印で読める言語のぶんを取り出す。
  const joined = joinLocaleNotes(['- 直したこと。', '- What was fixed.']);
  assert.match(joined, /^- 直したこと。/);
  assert.match(joined, /<!-- lang:en -->/);
  assert.equal(joined.endsWith('- What was fixed.'), true);
});

test('英語が無ければ、目印を入れない', () => {
  // 目印だけあって中身が無いと、英語の利用者に空の本文が出る。
  assert.equal(joinLocaleNotes(['- 直したこと。', '']), '- 直したこと。');
});

test('版の見出しを前方一致で拾わない', () => {
  // `## 0.4.0` を探しているときに `## 0.4.0-rc.1` を拾うと、別物の中身が出る。
  const withRc = CHANGELOG.replace('## 0.4.0', '## 0.4.0-rc.1');
  assert.equal(extractReleaseNotes(withRc, 'v0.4.0'), '');
});
