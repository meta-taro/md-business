/**
 * 控えにする／控えから戻す（DOM 非依存の純ロジック）。
 *
 * 文言を書き直したとき、元の文言の行を消していいか毎回悩む状態をやめるための操作。
 * 行はファイルに残したまま、表から外す（`#@ hidden <id> …`）。
 *
 * 指すのは行 ID だけ。行インデックスで覚えると、1 行挿さった時点で別の行が控えになり、
 * 悩みが増える。行の中身も並びも動かさず、宣言だけを書き換える。
 */
import { readHiddenIds, setHiddenIds } from '@md-business/schema-test-spec-tsv';
import type { IdentifiedTsv } from '@md-business/schema-test-spec-tsv';

/** 控えの宣言を書き換えた新ドキュメント。 */
function withHiddenIds(doc: IdentifiedTsv, ids: readonly string[]): IdentifiedTsv {
  return { ...doc, directives: setHiddenIds(doc.directives, ids) };
}

/** この検証シートが預かっている控えの件数。表から外れていても数えられる。 */
export function hiddenRowCount(doc: IdentifiedTsv): number {
  return readHiddenIds(doc.directives).length;
}

/** `index` 行が控えとして宣言されているか。控えを表示中の行マーカーに使う。 */
export function isHiddenRow(doc: IdentifiedTsv, index: number): boolean {
  const id = doc.rowIds[index];
  return id !== undefined && readHiddenIds(doc.directives).includes(id);
}

/** `index` 行を控えにする。範囲外・すでに控えなら変更しない。 */
export function hideRow(doc: IdentifiedTsv, index: number): IdentifiedTsv {
  const id = doc.rowIds[index];
  if (id === undefined) return doc;

  const ids = readHiddenIds(doc.directives);
  if (ids.includes(id)) return doc;

  return withHiddenIds(doc, [...ids, id]);
}

/** `index` 行を控えから戻す。範囲外・控えでないなら変更しない。 */
export function unhideRow(doc: IdentifiedTsv, index: number): IdentifiedTsv {
  const id = doc.rowIds[index];
  if (id === undefined) return doc;

  const ids = readHiddenIds(doc.directives);
  if (!ids.includes(id)) return doc;

  return withHiddenIds(
    doc,
    ids.filter((each) => each !== id),
  );
}
