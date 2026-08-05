/**
 * 選択範囲を下方向へ埋める（表計算の Ctrl+D 相当・DOM 非依存）。
 *
 * 検証シートは実施のたびに `結果` `実施日` `担当` を同じ値で何十行も埋める。
 * 列ごとの専用機能を作らず、範囲を選んで下へ配る 1 本で済ませる。
 */
import type { TsvDocument } from '@md-business/schema-test-spec-tsv';
import type { RangeBounds } from './gridRange';

/**
 * 埋める元の行と、埋める先の最終行を求める。
 *
 * 単一行の選択は直上を種にする（表計算と同じ）。範囲選択は先頭行が種で、埋める先は次の行から。
 * 実データより下（パッド行）へは書かない。空行を実体化させるのは行追加の仕事。
 */
function fillRange(doc: TsvDocument, bounds: RangeBounds): { from: number; to: number } | null {
  const last = doc.rows.length - 1;
  const from = bounds.r0 === bounds.r1 ? bounds.r0 - 1 : bounds.r0;
  const to = Math.min(bounds.r1, last);
  if (from < 0 || from > last || to <= from) return null;
  return { from, to };
}

/** 下へ埋められる範囲か（導線の活性判定。{@link fillDown} と同じ判断に乗せる）。 */
export function canFillDown(doc: TsvDocument, bounds: RangeBounds): boolean {
  return fillRange(doc, bounds) !== null;
}

/**
 * 範囲の先頭行の値を、以降の行へ列ごとに配った **新しい** ドキュメントを返す（入力は不変）。
 * 値が 1 つも変わらないなら入力をそのまま返す（履歴に空のスナップショットを積まない）。
 *
 * 行数が変わらないので、行 ID を載せた doc をそのまま通せる。
 */
export function fillDown<T extends TsvDocument>(doc: T, bounds: RangeBounds): T {
  const range = fillRange(doc, bounds);
  if (range === null) return doc;
  const { from, to } = range;

  const source = doc.rows[from] as string[];
  let changed = false;
  const rows = doc.rows.map((cells, rowIndex) => {
    if (rowIndex <= from || rowIndex > to) return cells;
    let next: string[] | null = null;
    for (let c = bounds.c0; c <= bounds.c1; c++) {
      const value = source[c] ?? '';
      // 省略された末尾セルは空として比べる。空を配るために列を増やすと、
      // 中身は変わらないのに末尾タブだけ伸びた差分が出る。
      if ((cells[c] ?? '') === value) continue;
      // 末尾セルが省略された短い行（validateTsv が許す形）は空で詰めてから設定する。
      next ??= cells.slice();
      while (next.length <= c) next.push('');
      next[c] = value;
    }
    if (next === null) return cells;
    changed = true;
    return next;
  });

  return changed ? { ...doc, rows } : doc;
}
