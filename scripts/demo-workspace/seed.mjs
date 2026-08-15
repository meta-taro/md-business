// 画面キャプチャ用のワークスペースを作る。
//
// キャプチャに写るファイル名・フォルダ名・中身は、すべてここで決まる。手元のフォルダを
// 開いて撮ると、パンくずに利用者名が入り、ファイル一覧に実在の取引先が並ぶ。中身を
// 見てから伏せるのではなく、はじめから架空のものしか無い場所を作って、そこだけを開く。
//
//   node scripts/demo-workspace/seed.mjs [出力先]
//
// 出力先の既定は C:\demo\md-business（利用者名を含まない場所）。既にあれば作り直す。
// 素材は templates/ をそのまま使う。テンプレートは全項目がダミー値で、ajv 検証も
// 通っているので、別途デモ用のデータを書き起こす必要がない。

import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const templates = join(repoRoot, 'templates');

/**
 * 置き先 → 素材。フォルダ名と連番は、実際の業務フォルダに見えるように付けている
 * （テンプレート名のまま並べると、製品の紹介ではなく雛形置き場の紹介になる）。
 */
const FILES = [
  ['01-請求/2026-06-御請求書.md', 'invoice/standard-ja.md'],
  ['01-請求/2026-06-御見積書.md', 'invoice/quote-ja.md'],
  ['01-請求/2026-06-領収書.md', 'invoice/receipt-ja.md'],
  ['01-請求/2026-06-御請求書（免税）.md', 'invoice/tax-exempt-ja.md'],
  ['02-設計/基本設計書.md', 'spec/standard-ja.md'],
  ['02-設計/API仕様書.md', 'api-spec/standard-ja.md'],
  ['03-検証/001-受注ワークフロー.tsv', 'test-spec/standard-ja.tsv'],
  ['03-検証/001-受注ワークフロー.md', 'test-spec/standard-ja.md'],
  ['04-調査/障害調査報告書.md', 'investigation/standard-ja.md'],
];

const outRoot = resolve(process.argv[2] ?? 'C:\\demo\\md-business');

await rm(outRoot, { recursive: true, force: true });
for (const [dest, src] of FILES) {
  const to = join(outRoot, dest);
  await mkdir(dirname(to), { recursive: true });
  await cp(join(templates, src), to);
}

process.stdout.write(`${outRoot}\n`);
