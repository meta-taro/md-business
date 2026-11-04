// `server.json` は MCP Registry に md-business の MCP サーバーを載せるための宣言。
//
// 版を持つのに、読むのはリリースのときだけなので、放っておくと古い版を名乗り続ける。
// 載っている版が古いと、見つけた人には手入れされていない道具に見える。
// ここでアプリの版と揃っていることを確かめる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

test('server.json は持ち主の GitHub 名前空間で md-business を名乗る', () => {
  const server = json('server.json');
  assert.equal(server.name, 'io.github.meta-taro/md-business');
  assert.equal(server.repository.url, 'https://github.com/meta-taro/md-business');
  assert.equal(server.repository.source, 'github');
});

test('server.json の版はデスクトップアプリの版と同じ', () => {
  const app = json('apps/desktop/src-tauri/tauri.conf.json').version;
  assert.equal(
    json('server.json').version,
    app,
    `server.json の "version" を "${app}" にする（アプリの版を上げるときに一緒に上げる）`,
  );
});

test('説明はレジストリの上限（100 文字）に収まる', () => {
  // 上限を超えると公開の時点で断られる。公開はリリースの後なので、気づくのが遅すぎる。
  const { description } = json('server.json');
  assert.ok(description.length > 0 && description.length <= 100, description);
});

test('npm などの配布物を名乗らない', () => {
  // MCP サーバーはデスクトップアプリに同梱して配る。レジストリは名乗った配布物を
  // 取りに行って確かめるので、存在しない配布物を書くと公開に失敗する。
  assert.equal(json('server.json').packages, undefined);
});
