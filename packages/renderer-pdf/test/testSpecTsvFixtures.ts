import type { TestSpecTsvPrintDoc } from '../src/testSpecTsvTemplate.js';

/**
 * 検証シート（カスタム TSV）の印刷用データの標準形。
 * デスクトップ側がディレクティブを解いて組み上げた後の姿を模す。
 */
export function standardTsvSheet(
  overrides: Partial<TestSpecTsvPrintDoc> = {},
): TestSpecTsvPrintDoc {
  return {
    title: 'デスクトップ v0.24.0 検証シート',
    meta: [
      { key: '文書番号', value: 'TEST-md-business-015' },
      { key: '版', value: '0.24.0' },
      { key: 'ステータス', value: '未実施' },
    ],
    notes: ['結果 列を埋めてよいのは、実物を動かして目で見た人だけ。'],
    columns: [
      { name: 'No.', align: 'right', width: 48 },
      { name: '項目', width: 260 },
      { name: '手順', width: 300 },
      { name: '結果', align: 'center', width: 88 },
    ],
    rows: [
      { cells: ['1', '下見に切り替わる', '1. .tsv を開く\n2. 下見を押す', '未実施'] },
      { cells: ['2', '見出しが繰り返す', '1. 2 ページ目を見る', 'OK'], tint: '#e7f6ec' },
    ],
    ...overrides,
  };
}
