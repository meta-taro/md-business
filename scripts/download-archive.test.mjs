// 過去の版の一覧ページが「どのリリースを並べるか」を決める部分の検査。
//
// 実体は docs/assets/release-archive.mjs に置く（ページから読み込むので配信対象に要る）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveEntries, releasesApiUrl } from '../docs/assets/release-archive.mjs';

const rel = (tag, extra = {}) => ({
  tag_name: tag,
  published_at: '2026-11-01T00:00:00Z',
  draft: false,
  prerelease: false,
  html_url: `https://github.com/meta-taro/md-business/releases/tag/${tag}`,
  assets: [
    { name: 'md-business_1.0.0_x64_en-US.msi' },
    { name: 'md-business_1.0.0_arm64-setup.exe' },
    { name: 'md-business_1.0.0_universal.dmg' },
    { name: 'latest.json' },
  ],
  ...extra,
});

test('一覧の API は 1 ページ分の件数を付けて引く', () => {
  assert.equal(
    releasesApiUrl('meta-taro/md-business', 1),
    'https://api.github.com/repos/meta-taro/md-business/releases?per_page=100&page=1',
  );
});

test('下書き・試験版・三つ組でないタグは並べない', () => {
  const entries = archiveEntries([
    rel('v0.39.0'),
    rel('v0.40.0', { draft: true }),
    rel('v0.38.1', { prerelease: true }),
    rel('chrome-0.13.1'),
  ]);
  assert.deepEqual(entries.map((e) => e.version), ['0.39.0']);
});

test('新しい版から順に並べる（API の並びに頼らない）', () => {
  const entries = archiveEntries([rel('v0.9.0'), rel('v0.39.0'), rel('v0.10.1')]);
  assert.deepEqual(entries.map((e) => e.version), ['0.39.0', '0.10.1', '0.9.0']);
});

test('各版は日付と、その版を開くダウンロードページへの道と、OS ごとの有無を持つ', () => {
  const [e] = archiveEntries([rel('v0.39.0')]);
  assert.equal(e.date, '2026-11-01');
  assert.equal(e.downloadHref, '../?v=0.39.0');
  assert.equal(e.releaseUrl, 'https://github.com/meta-taro/md-business/releases/tag/v0.39.0');
  assert.deepEqual(e.platforms, ['Windows x64', 'Windows ARM64', 'macOS']);
});

test('配る成果物が 1 本も無い版は並べない', () => {
  const entries = archiveEntries([rel('v0.1.0', { assets: [{ name: 'latest.json' }] })]);
  assert.deepEqual(entries, []);
});

test('GitHub 以外へ向く html_url は捨てる', () => {
  const [e] = archiveEntries([rel('v0.39.0', { html_url: 'https://example.com/x' })]);
  assert.equal(e.releaseUrl, 'https://github.com/meta-taro/md-business/releases/tag/v0.39.0');
});
