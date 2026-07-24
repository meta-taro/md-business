import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scanText } from './patterns.mjs';

const ids = (findings) => findings.map((f) => f.patternId);

test('内部ロール用語を検出する', () => {
  assert.ok(ids(scanText('司令塔が判断する')).includes('internal-role'));
  assert.ok(ids(scanText('伝書鳩でリレーする')).includes('internal-role'));
});

test('内部ルールのセクション参照を検出する', () => {
  assert.ok(ids(scanText('baseline 項目5 に従う')).includes('internal-rule-ref'));
  assert.ok(ids(scanText('baseline §6 の通り')).includes('internal-rule-ref'));
  assert.ok(ids(scanText('Baseline 1 (supply chain)')).includes('internal-rule-ref'));
});

test('内部リポ/担当ハンドルを検出する', () => {
  assert.ok(ids(scanText('dokokade/store-x')).includes('internal-handle'));
  assert.ok(ids(scanText('assignee: kajiwara888')).includes('internal-handle'));
  assert.ok(ids(scanText('s-yoko-dokokade が担当')).includes('internal-handle'));
  assert.ok(ids(scanText('dev-slot2 に割当')).includes('internal-handle'));
});

test('日付つき作業者帰属コメントを検出する', () => {
  const f = scanText('// 田中さん依頼 2026-07-22 の対応');
  assert.ok(ids(f).includes('author-attribution'));
  assert.ok(ids(f).includes('pdm-honorific'));
});

test('内部役割呼称 PdM を検出する', () => {
  assert.ok(ids(scanText('PdM に確認する')).includes('pdm-term'));
});

test('公開組織ハンドル meta-taro は検出しない', () => {
  assert.equal(scanText('https://github.com/meta-taro/md-business').length, 0);
});

test('CSS の baseline は誤検出しない', () => {
  assert.equal(scanText('  align-items: baseline;').length, 0);
  assert.equal(scanText('vertical-align: baseline').length, 0);
  assert.equal(scanText('font-size: 14px; /* baseline grid */').length, 0);
});

test('業務文書のサンプル人名（さん無し）は検出しない', () => {
  assert.equal(scanText('| 取引先 | 山田太郎 |').length, 0);
});

test('行番号・列番号・一致文字列を返す', () => {
  const f = scanText('ok\n  司令塔');
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 2);
  assert.equal(f[0].col, 3);
  assert.equal(f[0].matched, '司令塔');
});

test('allowlist は一致文字列を抑制する', () => {
  assert.equal(scanText('司令塔', { allow: ['司令塔'] }).length, 0);
});

test('allowlist は行全体一致でも抑制する', () => {
  const line = '  // 田中さん依頼 2026-07-22 の対応';
  assert.equal(scanText(line, { allow: ['// 田中さん依頼 2026-07-22 の対応'] }).length, 0);
});
