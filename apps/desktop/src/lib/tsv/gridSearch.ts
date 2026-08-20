// 表（検証シート）の中を探す純ロジック（DOM 非依存・vitest 単体テスト層）。
// エディター／プレビューと同じ検索窓から呼ばれるが、当たりの単位が「文字の範囲」ではなく
// 「セル」である点が違う。表は 1 セルが 1 つの入力欄なので、同じセル内に何度出てきても
// 移動先は同じ 1 箇所にしかならない。

import type { TsvDocument } from '@md-business/schema-test-spec-tsv';

/** 当たったセルの位置（行・列とも 0 始まり）。 */
export interface CellMatch {
  row: number;
  col: number;
}

/**
 * 表の中で当たったセルを、上の行から左の列の順に列挙する。
 * regex は buildSearchRegex 由来（null＝検索できない状態）。
 * 走査するのは宣言されている列までで、行に余分な値が残っていても見えない列は探さない。
 */
export function findGridMatches(doc: TsvDocument, regex: RegExp | null): CellMatch[] {
  if (regex === null) return [];
  const probe = new RegExp(regex.source, regex.flags.replace('g', ''));
  const width = doc.columns.length;
  const matches: CellMatch[] = [];
  for (let row = 0; row < doc.rows.length; row += 1) {
    const cells = doc.rows[row] ?? [];
    for (let col = 0; col < width; col += 1) {
      const text = cells[col] ?? '';
      if (text !== '' && probe.test(text)) matches.push({ row, col });
    }
  }
  return matches;
}

/**
 * 今いるセル以降で最初の当たりを返す。後ろに無ければ先頭へ回る。当たりが無ければ -1。
 * 検索を始めた位置から前へ戻らないので、上から順に見ていく操作と向きが揃う。
 */
export function matchIndexFrom(matches: CellMatch[], from: CellMatch): number {
  if (matches.length === 0) return -1;
  const found = matches.findIndex(
    (m) => m.row > from.row || (m.row === from.row && m.col >= from.col),
  );
  return found === -1 ? 0 : found;
}
