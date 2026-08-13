/**
 * アクティブセルへ焦点を寄せる処理が「今回は何をするか」を決める純関数。
 * ------------------------------------------------------------------
 * グリッドの焦点合わせは、アクティブセルとモード以外の理由でも走り直す。本文はセルを
 * 1 つ確定するたびに組み直され、行の高さも列の型も選択肢もそこから導き直すためで、
 * スクロールや別シートの読み込みでも同じことが起きる。走り直すたびに編集開始の仕込み
 * （既存値の全選択・候補リストを開く）をやり直すと、1 文字打つたびに値が全選択され、
 * 次の 1 文字がそれを置き換える＝最後に打った 1 文字しか残らない。
 *
 * 焦点の奪い返しも同じ理由で害になる。利用者が左のエディターを触っている最中に
 * グリッドが焦点を取り戻すと、以降の打鍵が意図しないセルへ入る。
 *
 * そこで判断材料を「同じセル・同じモードのまま走り直したか」と「今どこに焦点があるか」
 * の 2 つに絞り、DOM 操作は呼び出し側に残す（ここは node 環境の vitest で全分岐を検査できる）。
 */

/** 焦点を合わせる先。編集中かどうかで当てる相手（静的セル / 入力）が変わる。 */
export interface FocusSpot {
  row: number;
  col: number;
  editing: boolean;
}

/**
 * いま焦点がどこにあるか。
 * - `none`: どこにも無い（間引きで要素が作り直され、焦点が浮いた状態）
 * - `grid`: グリッドの中（別のセル・行メモの下書き・列メニュー等）
 * - `outside`: グリッドの外（エディター・左レール・ダイアログ等）
 */
export type FocusWhere = 'none' | 'grid' | 'outside';

export interface FocusPlan {
  /** 今回の対象を表す鍵。呼び出し側は次回の判定用にこれを控える。 */
  spot: string;
  /** 編集開始の仕込み（種の流し込み・候補リスト・全選択）をしてよいか。 */
  prepare: boolean;
  /** 焦点を当てに行ってよいか。 */
  takeFocus: boolean;
}

/** セル位置とモードから、対象が変わったかを比べるための鍵を作る。 */
export function focusSpotKey(spot: FocusSpot): string {
  return `${spot.row}:${spot.col}:${spot.editing ? 'edit' : 'nav'}`;
}

/**
 * 今回の焦点合わせで何をするかを決める。
 *
 * - 対象が変わった（＝利用者がセルを移したか編集へ入った）ときだけ仕込む。
 * - 焦点の奪取は、対象が変わったときと、どこにも焦点が無いときに限る。
 *   グリッドの外に焦点があるならそれは利用者が今触っている場所なので触らない。
 *   グリッドの中の別要素（行メモの下書きなど）も、打鍵の途中で奪うと同じ壊れ方をする。
 */
export function planCellFocus(
  spot: FocusSpot,
  prepared: string | null,
  where: FocusWhere,
): FocusPlan {
  const key = focusSpotKey(spot);
  const moved = key !== prepared;
  return { spot: key, prepare: moved, takeFocus: moved || where === 'none' };
}
