// ダウンロードページが「どの成果物をどの入口に出すか」を決める部分の検査。
//
// Windows は x64 と ARM64 の 2 本がある。拡張子だけで選ぶと、先に並んだほうが
// どちらの機械にも出てしまうので、名前に入っている形で分ける。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAsset, pickPrimary, archFromHints } from '../docs/assets/release-assets.mjs';

const NAMES = [
  'latest.json',
  'md-business_0.33.0_arm64-setup.exe',
  'md-business_0.33.0_arm64-setup.exe.sig',
  'md-business_0.33.0_arm64_en-US.msi',
  'md-business_0.33.0_arm64_en-US.msi.sig',
  'md-business_0.33.0_universal.dmg',
  'md-business_0.33.0_x64-setup.exe',
  'md-business_0.33.0_x64_en-US.msi',
  'md-business_universal.app.tar.gz',
];
const assets = NAMES.map((name) => ({ name, meta: classifyAsset(name) })).filter((a) => a.meta);

test('配る対象だけを拾い、署名・更新用は外す', () => {
  assert.deepEqual(assets.map((a) => a.name), [
    'md-business_0.33.0_arm64-setup.exe',
    'md-business_0.33.0_arm64_en-US.msi',
    'md-business_0.33.0_universal.dmg',
    'md-business_0.33.0_x64-setup.exe',
    'md-business_0.33.0_x64_en-US.msi',
  ]);
});

test('Windows は名前の形で x64 / ARM64 を分け、用途の表記にも出す', () => {
  const arm = classifyAsset('md-business_0.33.0_arm64_en-US.msi');
  assert.equal(arm.os, 'windows');
  assert.equal(arm.arch, 'arm64');
  assert.match(arm.kind, /ARM64/);
  const x64 = classifyAsset('md-business_0.33.0_x64-setup.exe');
  assert.equal(x64.arch, 'x64');
  assert.match(x64.kind, /x64/);
  assert.notEqual(arm.kind, classifyAsset('md-business_0.33.0_x64_en-US.msi').kind);
});

test('形の入っていない古い名前は x64 として扱う', () => {
  // ARM64 を出す前の版は x64 しか無かった。?v= で古い版を見ても入口が消えないようにする。
  assert.equal(classifyAsset('md-business_0.9.0_en-US.msi').arch, 'x64');
});

test('ARM の Windows には ARM64 の MSI を出す', () => {
  assert.equal(pickPrimary(assets, 'windows', 'arm64').name, 'md-business_0.33.0_arm64_en-US.msi');
});

test('x64 の Windows・形が分からない Windows には x64 の MSI を出す', () => {
  assert.equal(pickPrimary(assets, 'windows', 'x64').name, 'md-business_0.33.0_x64_en-US.msi');
  assert.equal(pickPrimary(assets, 'windows', null).name, 'md-business_0.33.0_x64_en-US.msi');
});

test('ARM64 が無い版を ARM の機械で見たら、主ボタンを出さない', () => {
  // 黙って x64 を渡すと、ARM 用だと思って入れてしまう。一覧から選んでもらう。
  const old = ['md-business_0.31.0_x64_en-US.msi'].map((name) => ({ name, meta: classifyAsset(name) }));
  assert.equal(pickPrimary(old, 'windows', 'arm64'), undefined);
});

test('Mac は形を問わず universal の DMG', () => {
  assert.equal(pickPrimary(assets, 'macos', 'arm64').name, 'md-business_0.33.0_universal.dmg');
  assert.equal(pickPrimary(assets, 'macos', null).name, 'md-business_0.33.0_universal.dmg');
});

test('ブラウザの手がかりから機械の形を読む', () => {
  assert.equal(archFromHints({ architecture: 'arm', bitness: '64' }), 'arm64');
  assert.equal(archFromHints({ architecture: 'x86', bitness: '64' }), 'x64');
  // 手がかりが無い（Firefox / Safari）・読めないときは決めない。
  assert.equal(archFromHints(undefined), null);
  assert.equal(archFromHints({}), null);
});
