/**
 * 検証グリッドのクリップボード貼り付けロジック（Issue 010・検証グリッド）。
 * ------------------------------------------------------------------
 * Excel / Google Sheets からコピーした矩形（タブ区切り × 改行）を、アンカーセルを
 * 起点にグリッドへ流し込む純関数。DOM 非依存で node 環境の vitest で検査する。
 * TsvGrid の paste ハンドラは clipboardData から文字列を取り出して呼ぶだけ。
 *
 * 方針: 行（＝データ）は足りなければ空行を足して伸ばす。列（＝型付きスキーマ）は
 * 固定なので、右へ溢れた分は切り捨てる（勝手に無型の列を生やさない）。
 */
import type { TsvDocument } from '@md-business/schema-test-spec-tsv';
import type { CellPos } from './gridNav';

/** クリップボード文字列（TSV）を文字列の二次元配列へ。空文字は空配列。 */
export function parseClipboardMatrix(text: string): string[][] {
  if (text === '') return [];
  const lines = text.split(/\r\n|\r|\n/);
  // Excel / Sheets は末尾に改行を付ける。末尾の空行 1 個だけ捨てる。
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => line.split('\t'));
}

/**
 * アンカーセルを左上として矩形を貼り込んだ **新しい** ドキュメントを返す（入力は不変）。
 * 貼り付けるものが無い / 列範囲外のアンカーなら、元ドキュメントをそのまま返す。
 */
export function applyPaste(doc: TsvDocument, anchor: CellPos, text: string): TsvDocument {
  const matrix = parseClipboardMatrix(text);
  const colCount = doc.columns.length;
  if (matrix.length === 0 || colCount === 0 || anchor.col >= colCount) return doc;

  const rows = doc.rows.map((cells) => cells.slice());
  const lastRow = anchor.row + matrix.length - 1;
  while (rows.length <= lastRow) rows.push(new Array<string>(colCount).fill(''));

  matrix.forEach((cells, i) => {
    const row = rows[anchor.row + i];
    cells.forEach((value, j) => {
      const c = anchor.col + j;
      if (c >= colCount) return; // 列は固定＝溢れは切り捨て
      while (row.length <= c) row.push('');
      row[c] = value;
    });
  });

  return { ...doc, rows };
}

/**
 * `index` 行を、クリップボード用の TSV 文字列（タブ区切り）へ直列化する。
 * 列数ぶんパディングして末尾の空セルも位置として残す。範囲外は空文字。
 */
export function rowToTsv(doc: TsvDocument, index: number): string {
  const cells = doc.rows[index];
  if (cells === undefined) return '';
  const padded = cells.slice();
  while (padded.length < doc.columns.length) padded.push('');
  return padded.join('\t');
}
