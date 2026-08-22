/**
 * セルの注釈（`#@ annot`）のグリッド側。DOM 非依存の純ロジック。
 *
 * 宣言の読み書きはスキーマ側（`readAnnotations` / `setAnnotations`）が持つ。ここが引き受け
 * るのは、記載順に並んだ注釈を **表の位置へ引き直す**ところ。紙に振る通し番号もここで決まる。
 *
 * ## 番号はファイルに持たない
 *
 * 1 件挿しただけで以降の全番号が振り直しになり、宣言ブロック全体が書き換わって差分が
 * 読めなくなる。番号は引き直すたびに上から（行 → 列）付け直す。
 *
 * ## 引けない注釈は消さない
 *
 * 列名を打ち間違えた注釈は表に出せないが、並びから外すだけで宣言は残す（`#@ mark` と同じ）。
 * そのため付け外しの宛先は **表での位置ではなく記載順の位置**で持つ。表での位置で指すと、
 * 引けない注釈が 1 本混ざった瞬間に別の注釈を消す。
 */
import {
  readAnnotations,
  setAnnotations,
  type CellAnnotation,
  type IdentifiedTsv,
} from '@md-business/schema-test-spec-tsv';

/** 表の位置へ引けた注釈 1 件。 */
export interface PlacedAnnotation {
  /** 記載順での位置。書き換え・削除の宛先。 */
  index: number;
  /** 上から振り直した通し番号（1 始まり）。紙に出すのはこれ。 */
  number: number;
  /** 表での行。 */
  row: number;
  /** 表での列。 */
  col: number;
  /** 注釈の本文。 */
  body: string;
}

/** 注釈を表の位置へ引き直し、上から（行 → 列）通し番号を振る。引けないものは並びに出ない。 */
export function placeAnnotations(doc: IdentifiedTsv): PlacedAnnotation[] {
  const rowOf = new Map(doc.rowIds.map((id, row) => [id, row]));
  const colOf = new Map(doc.columns.map((column, col) => [column.name, col]));

  const placed = readAnnotations(doc.directives).flatMap((annotation, index) => {
    const row = rowOf.get(annotation.id);
    const col = colOf.get(annotation.column);
    if (row === undefined || col === undefined) return [];
    return [{ index, number: 0, row, col, body: annotation.body }];
  });

  // 同じセルの複数件は記載順のまま続き番号にしたいので、行 → 列 → 記載順で並べる。
  placed.sort((a, b) => a.row - b.row || a.col - b.col || a.index - b.index);

  return placed.map((annotation, i) => ({ ...annotation, number: i + 1 }));
}

/** そのセルに付いた注釈を、番号の順に返す。 */
export function annotationsAt(
  placed: readonly PlacedAnnotation[],
  row: number,
  col: number,
): PlacedAnnotation[] {
  return placed.filter((annotation) => annotation.row === row && annotation.col === col);
}

/** 注釈の並びを差し替えた文書を返す。**行と列は触らない**（注釈は表の外の話）。 */
function withAnnotations(doc: IdentifiedTsv, annotations: readonly CellAnnotation[]): IdentifiedTsv {
  return { ...doc, directives: setAnnotations(doc.directives, annotations) };
}

/** セルへ注釈を 1 件足す。既にある注釈の後ろに付く。 */
export function addAnnotation(
  doc: IdentifiedTsv,
  row: number,
  col: number,
  body: string,
): IdentifiedTsv {
  const id = doc.rowIds[row];
  const column = doc.columns[col]?.name;
  if (id === undefined || id === '' || column === undefined || column === '') return doc;
  if (body.trim() === '') return doc;

  return withAnnotations(doc, [...readAnnotations(doc.directives), { id, column, body }]);
}

/** 注釈の本文を書き換える。空にしたら消す（消し方が無いと去年の注釈が残り続ける）。 */
export function setAnnotationBody(doc: IdentifiedTsv, index: number, body: string): IdentifiedTsv {
  const annotations = readAnnotations(doc.directives);
  if (annotations[index] === undefined) return doc;

  const next = body.trim() === ''
    ? annotations.filter((_, i) => i !== index)
    : annotations.map((annotation, i) => (i === index ? { ...annotation, body } : annotation));

  return withAnnotations(doc, next);
}

/** 注釈を 1 件消す。同じセルに 2 件あっても片方だけ消える。 */
export function removeAnnotation(doc: IdentifiedTsv, index: number): IdentifiedTsv {
  return setAnnotationBody(doc, index, '');
}
