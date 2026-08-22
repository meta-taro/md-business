/**
 * 検証シートのテキスト ⇄ グリッドの変換（DOM 非依存の純ロジック）。
 *
 * グリッドが扱う doc は、ファイルの中身そのままではない。行 ID 列と控え行を外した
 * 「表として見せる分」だけを渡し、保存で元へ戻す。外してしまえば、選択・移動・貼り付け・
 * 検証は行インデックスのまま無改修で動く。
 *
 * ここに置いているのは **順序** のため。読み込みは ID 列 → 控え行 → 絞り込みの順に外す
 * （控えは行 ID で指すので、ID が出そろう前には引けない）。書き戻しは絞り込み → 控え行 →
 * ID 列の順に戻す。呼び出し側で都度組むと、取り違えたときに行が黙って消えたまま保存される。
 *
 * 控えと絞り込みを戻す順序が決まっているのは、控えの戻り先（直前の可視行）が絞り込みで外れた
 * 行を指していることがあるため。控えを先に戻すと戻り先が見つからず、末尾へ回ってしまう。
 */
import {
  mergeHiddenRows,
  parseTsv,
  serializeTsv,
  splitHiddenRows,
  splitRowsById,
  withRowIds,
  withoutRowIds,
  type HiddenRow,
  type IdentifiedTsv,
} from '@md-business/schema-test-spec-tsv';
import { preserveTrailingEol } from './gridEol';

/**
 * 表から外して預かっている行。書き戻しでそのまま {@link saveGridDoc} へ返す。
 *
 * 控えと絞り込みを 1 つの配列に混ぜないのは、**戻す順序が決まっている**から。混ぜると
 * 呼び出し側からは順序が見えなくなり、並べ替えた瞬間に控えの位置が崩れる。
 */
export interface DetachedRows {
  /** 控え行（`#@ hidden`）。宣言がファイルに残る。 */
  hidden: readonly HiddenRow[];
  /** 絞り込みで外した行。ファイルには何も残らない。 */
  filtered?: readonly HiddenRow[];
}

/** グリッドへ渡す表と、表から外して預かる行。 */
export interface GridDoc extends DetachedRows {
  /** 表として見せる分（ID 列・控え行・絞り込みを外したもの）。 */
  doc: IdentifiedTsv;
  hidden: HiddenRow[];
  filtered: HiddenRow[];
}

/** 読み込みの指定。 */
export interface LoadGridDocOptions {
  /**
   * 控え行も表に出す。控えから戻す操作の導線で、外す処理を止めるだけ。
   *
   * 出しても宣言（`#@ hidden`）はそのまま残るので、表示したまま保存しても控えは控えのまま。
   */
  reveal?: boolean;
  /**
   * 絞り込みで表から外す行 ID。
   *
   * 控えと違い、外したことはファイルに残さない（開き直せば元に戻る）。渡す集合は押した
   * 時点で決めたものをそのまま渡し続ける。当たっている行を都度数え直すと、値を直した行が
   * 目の前から消える。
   */
  without?: ReadonlySet<string>;
}

/** 検証シートのテキストを、グリッドの表と外して預かる行に分ける。 */
export function loadGridDoc(source: string, options: LoadGridDocOptions = {}): GridDoc {
  const parsed = withRowIds(parseTsv(source));
  const { doc, hidden } =
    options.reveal === true ? { doc: parsed, hidden: [] as HiddenRow[] } : splitHiddenRows(parsed);

  if (options.without === undefined || options.without.size === 0) {
    return { doc, hidden, filtered: [] };
  }

  const { doc: visible, taken } = splitRowsById(doc, options.without);
  return { doc: visible, hidden, filtered: taken };
}

/**
 * 外して預かっていた行を表へ戻す。**絞り込みを先に**戻す（{@link DetachedRows}）。
 *
 * 保存と、前の版との突き合わせの両方から使う。突き合わせ側で戻し忘れると、外した行が
 * すべて「消えた行」として出る。
 */
export function restoreRows(doc: IdentifiedTsv, detached: DetachedRows): IdentifiedTsv {
  return mergeHiddenRows(mergeHiddenRows(doc, detached.filtered ?? []), detached.hidden);
}

/**
 * グリッドの表と預かっている行を検証シートのテキストへ戻す。
 *
 * @param doc グリッドが編集した表。
 * @param detached 読み込みで外した行（{@link loadGridDoc} の返り値をそのまま渡せる）。
 * @param prev 元テキスト。末尾改行の有無を引き継ぐために使う。
 */
export function saveGridDoc(doc: IdentifiedTsv, detached: DetachedRows, prev: string): string {
  return preserveTrailingEol(serializeTsv(withoutRowIds(restoreRows(doc, detached))), prev);
}
