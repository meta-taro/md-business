// ダウンロードページが「どのリリースを見せるか」を決める部分の検査。
//
// 実体は docs/assets/release-target.mjs に置く（ページから読み込むので配信対象に要る）。
// 検査だけはここに置いて、配信されるディレクトリにテストを混ぜないようにしている。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestedTag, releaseApiUrl } from '../docs/assets/release-target.mjs';

const REPO = 'meta-taro/md-business';

test('版の指定が無ければ null（最新を見せる）', () => {
  assert.equal(requestedTag(''), null);
  assert.equal(requestedTag('?'), null);
  assert.equal(requestedTag('?foo=bar'), null);
});

test('v あり・なしのどちらでも受け取り、タグの形に揃える', () => {
  assert.equal(requestedTag('?v=0.9.0'), 'v0.9.0');
  assert.equal(requestedTag('?v=v0.9.0'), 'v0.9.0');
  assert.equal(requestedTag('?foo=bar&v=v0.10.1'), 'v0.10.1');
});

test('三つ組の数字以外は受け取らない', () => {
  // ここで受け取った文字列はそのまま API の path に入る。緩めると、
  // ダウンロード先を別のリポジトリへ向けるリンクを作れてしまう。
  assert.equal(requestedTag('?v=0.9'), null);
  assert.equal(requestedTag('?v=latest'), null);
  assert.equal(requestedTag('?v=0.9.0-rc1'), null);
  assert.equal(requestedTag('?v=../../other/repo/releases/latest'), null);
  assert.equal(requestedTag('?v=0.9.0/../..'), null);
  assert.equal(requestedTag('?v='), null);
});

test('版を指定すればそのタグ、無ければ最新を引く', () => {
  assert.equal(
    releaseApiUrl(REPO, null),
    'https://api.github.com/repos/meta-taro/md-business/releases/latest',
  );
  assert.equal(
    releaseApiUrl(REPO, 'v0.9.0'),
    'https://api.github.com/repos/meta-taro/md-business/releases/tags/v0.9.0',
  );
});
