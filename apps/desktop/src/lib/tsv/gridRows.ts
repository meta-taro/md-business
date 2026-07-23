/**
 * 検証シートの行操作プリミティブ（Issue 010・検証グリッド）。
 * ------------------------------------------------------------------
 * QA がシートを組み立てる際の行の追加 / 挿入 / 複製 / 削除。すべて不変で
 * 新しいドキュメントを返す。DOM 非依存で node 環境の vitest で検査する。
 */
import type { TsvDocument } from '@md-business/schema-test-spec-tsv';

/** 列数ぶんの空セルからなる新しい行。 */
export function blankRow(doc: TsvDocument): string[] {
  return new Array<string>(doc.columns.length).fill('');
}

/** 末尾に空行を 1 行追加した新ドキュメント。 */
export function appendRow(doc: TsvDocument): TsvDocument {
  return { ...doc, rows: [...doc.rows, blankRow(doc)] };
}

/**
 * `index` 行の直後に空行を挿入する。`index = -1` で先頭、末尾以降を渡すと末尾に足す。
 */
export function insertRowAfter(doc: TsvDocument, index: number): TsvDocument {
  const at = Math.min(Math.max(index, -1) + 1, doc.rows.length);
  const rows = [...doc.rows.slice(0, at), blankRow(doc), ...doc.rows.slice(at)];
  return { ...doc, rows };
}

/** `index` 行の独立コピーを直後に挿入する。範囲外なら変更しない。 */
export function duplicateRow(doc: TsvDocument, index: number): TsvDocument {
  if (index < 0 || index >= doc.rows.length) return doc;
  const copy = doc.rows[index].slice();
  const rows = [...doc.rows.slice(0, index + 1), copy, ...doc.rows.slice(index + 1)];
  return { ...doc, rows };
}

/** `index` 行を削除する。範囲外なら変更しない。 */
export function deleteRow(doc: TsvDocument, index: number): TsvDocument {
  if (index < 0 || index >= doc.rows.length) return doc;
  return { ...doc, rows: doc.rows.filter((_, i) => i !== index) };
}
