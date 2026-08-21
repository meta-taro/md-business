/**
 * 手で付けるセルの印（`#@ mark`）の付け外し。DOM 非依存の純ロジック。
 *
 * 宣言の読み書きは schema 側（`readMarks` / `setMarks`）が持つ。ここが引き受けるのは、
 * 選択範囲を行 ID と列名の組へ畳み、**範囲全体で付けるか外すかを決める**ところだけ。
 *
 * 付け外しは表計算の太字と同じ流儀にする＝全部付いていれば外す、そうでなければ付ける。
 * 「1 つでも付いていたら外す」にすると、広く選んで一括で付ける操作ができなくなる。
 */
import {
  readMarks,
  setMarks,
  type IdentifiedTsv,
} from '@md-business/schema-test-spec-tsv';
import type { RangeBounds } from './gridRange';

/** そのセルに印が付いているか。行 ID か列名が無い場所は印を持てない。 */
export function isMarked(
  marks: ReadonlyMap<string, readonly string[]>,
  id: string | undefined,
  column: string | undefined,
): boolean {
  if (id === undefined || column === undefined) return false;
  return marks.get(id)?.includes(column) ?? false;
}

/** 範囲に入るセルを行 ID と列名の組で並べる。ID か名前が無いセルは印を持てないので外す。 */
function cellsIn(doc: IdentifiedTsv, bounds: RangeBounds): { id: string; column: string }[] {
  const cells: { id: string; column: string }[] = [];

  for (let row = Math.max(0, bounds.r0); row <= Math.min(bounds.r1, doc.rows.length - 1); row++) {
    const id = doc.rowIds[row];
    if (id === undefined || id === '') continue;
    for (
      let col = Math.max(0, bounds.c0);
      col <= Math.min(bounds.c1, doc.columns.length - 1);
      col++
    ) {
      const column = doc.columns[col]?.name;
      if (column === undefined || column === '') continue;
      cells.push({ id, column });
    }
  }

  return cells;
}

/**
 * 選択範囲の印を付け外しした文書を返す。**行と列は触らない**（印は見え方の話）。
 *
 * 印を持てるセルが範囲に 1 つも無ければ、受け取ったものをそのまま返す。
 */
export function toggleMarks(doc: IdentifiedTsv, bounds: RangeBounds): IdentifiedTsv {
  const cells = cellsIn(doc, bounds);
  if (cells.length === 0) return doc;

  const marks = readMarks(doc.directives);
  const marked = cells.every((cell) => isMarked(marks, cell.id, cell.column));

  for (const { id, column } of cells) {
    const columns = marks.get(id) ?? [];
    const next = marked
      ? columns.filter((name) => name !== column)
      : columns.includes(column)
        ? columns
        : [...columns, column];
    // 印が空になった行は宣言ごと消す。setMarks も空は書かないが、ここで落としておくと
    // 「印のある行」の並びが読み書きで一致する。
    if (next.length > 0) marks.set(id, next);
    else marks.delete(id);
  }

  return { ...doc, directives: setMarks(doc.directives, marks) };
}
