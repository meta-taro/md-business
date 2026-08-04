/**
 * 検証シートの行操作プリミティブ。
 * ------------------------------------------------------------------
 * QA がシートを組み立てる際の行の追加 / 挿入 / 複製 / 削除。すべて不変で
 * 新しいドキュメントを返す。DOM 非依存で node 環境の vitest で検査する。
 *
 * 行 ID は行と同じ並びで doc に載っている（`IdentifiedTsv`）。行数が変わる操作は
 * ID の並びも一緒に動かす。ここを外すと、保存された ID が別の行を指す。
 * 行数が変わらない操作は、スプレッドで ID がそのまま乗るので何もしない。
 */
import { generateRowId } from '@md-business/schema-test-spec-tsv';
import type { IdentifiedTsv, TsvDocument } from '@md-business/schema-test-spec-tsv';

/** 列数ぶんの空セルからなる新しい行。 */
export function blankRow(doc: TsvDocument): string[] {
  return new Array<string>(doc.columns.length).fill('');
}

/** 末尾に空行を 1 行追加した新ドキュメント。 */
export function appendRow(doc: IdentifiedTsv, newId: () => string = generateRowId): IdentifiedTsv {
  return { ...doc, rows: [...doc.rows, blankRow(doc)], rowIds: [...doc.rowIds, newId()] };
}

/**
 * `index` 行の直後に空行を挿入する。`index = -1` で先頭、末尾以降を渡すと末尾に足す。
 *
 * ID は挿入した位置に差し込むだけで、以降の行の ID はずらさない（`No.` との違い）。
 */
export function insertRowAfter(
  doc: IdentifiedTsv,
  index: number,
  newId: () => string = generateRowId,
): IdentifiedTsv {
  const at = Math.min(Math.max(index, -1) + 1, doc.rows.length);
  return {
    ...doc,
    rows: [...doc.rows.slice(0, at), blankRow(doc), ...doc.rows.slice(at)],
    rowIds: [...doc.rowIds.slice(0, at), newId(), ...doc.rowIds.slice(at)],
  };
}

/** `index` 行の独立コピーを直後に挿入する。範囲外なら変更しない。 */
export function duplicateRow(
  doc: IdentifiedTsv,
  index: number,
  newId: () => string = generateRowId,
): IdentifiedTsv {
  const source = doc.rows[index];
  if (source === undefined) return doc;
  const at = index + 1;
  return {
    ...doc,
    rows: [...doc.rows.slice(0, at), source.slice(), ...doc.rows.slice(at)],
    // 値は同じでも別の行。元の ID を写すと 2 行が同じものとして扱われる。
    rowIds: [...doc.rowIds.slice(0, at), newId(), ...doc.rowIds.slice(at)],
  };
}

/** `index` 行を削除する。範囲外なら変更しない。 */
export function deleteRow(doc: IdentifiedTsv, index: number): IdentifiedTsv {
  if (index < 0 || index >= doc.rows.length) return doc;
  return {
    ...doc,
    rows: doc.rows.filter((_, i) => i !== index),
    rowIds: doc.rowIds.filter((_, i) => i !== index),
  };
}

/**
 * `index` 行の全セルを空にする（行は残す）。範囲外なら変更しない。
 *
 * 行は残る＝同じ行なので ID は動かさない。書き直しただけで ID が変わると、
 * レビューの往復で同じ行を追えなくなる。
 */
export function clearRow<T extends TsvDocument>(doc: T, index: number): T {
  if (index < 0 || index >= doc.rows.length) return doc;
  return { ...doc, rows: doc.rows.map((cells, i) => (i === index ? blankRow(doc) : cells)) };
}
