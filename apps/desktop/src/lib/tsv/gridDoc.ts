/**
 * 検証シートのテキスト ⇄ グリッドの変換（DOM 非依存の純ロジック）。
 *
 * グリッドが扱う doc は、ファイルの中身そのままではない。行 ID 列と控え行を外した
 * 「表として見せる分」だけを渡し、保存で元へ戻す。外してしまえば、選択・移動・貼り付け・
 * 検証は行インデックスのまま無改修で動く。
 *
 * ここに置いているのは **順序** のため。読み込みは ID 列 → 控え行の順に外す（控えは行 ID で
 * 指すので、ID が出そろう前には引けない）。書き戻しは控え行 → ID 列の順に戻す。呼び出し側で
 * 都度組むと、取り違えたときに行が黙って消えたまま保存される。
 */
import {
  mergeHiddenRows,
  parseTsv,
  serializeTsv,
  splitHiddenRows,
  withRowIds,
  withoutRowIds,
  type HiddenRow,
  type IdentifiedTsv,
} from '@md-business/schema-test-spec-tsv';
import { preserveTrailingEol } from './gridEol';

/** グリッドへ渡す表と、表から外して預かる控え行。 */
export interface GridDoc {
  /** 表として見せる分（ID 列・控え行を外したもの）。 */
  doc: IdentifiedTsv;
  /** 表から外した控え行。書き戻しでそのまま {@link saveGridDoc} へ返す。 */
  hidden: HiddenRow[];
}

/** 検証シートのテキストをグリッドの表と控え行に分ける。 */
export function loadGridDoc(source: string): GridDoc {
  return splitHiddenRows(withRowIds(parseTsv(source)));
}

/**
 * グリッドの表と控え行を検証シートのテキストへ戻す。
 *
 * @param doc グリッドが編集した表。
 * @param hidden 読み込みで外した控え行（{@link loadGridDoc} の返り値）。
 * @param prev 元テキスト。末尾改行の有無を引き継ぐために使う。
 */
export function saveGridDoc(
  doc: IdentifiedTsv,
  hidden: readonly HiddenRow[],
  prev: string,
): string {
  return preserveTrailingEol(serializeTsv(withoutRowIds(mergeHiddenRows(doc, hidden))), prev);
}
