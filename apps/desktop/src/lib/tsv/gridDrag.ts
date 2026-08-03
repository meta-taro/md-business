/**
 * マウスドラッグによる矩形選択。
 * ------------------------------------------------------------------
 * 押したセルをアンカーにして、通ったセルまで範囲を広げる（スプレッドシートと同じ操作）。
 * キーボード側の Shift+矢印と同じ {@link ./gridRange} の範囲表現へ落とすので、コピーや
 * 削除といった範囲を受け取る側は、マウスかキーボードかを区別しなくてよい。
 *
 * 押下を選択の開始として扱ってよいかの判定をここに置く。右クリックは列メニュー、
 * 編集中のセルはウィジェット自身の操作（テキスト選択・チェック）が優先で、
 * どちらも選択に奪われると操作できなくなる。
 */
import type { CellPos, GridDims } from './gridNav';
import { extendRangeTo, type CellRange } from './gridRange';

/** ポインタ押下の状況（DOM の PointerEvent から必要な分だけ写す）。 */
export interface PointerIntent {
  /** 押されたボタン。0 が主ボタン。 */
  button: number;
  /** Shift 併用＝アンカーを保って伸ばす。 */
  shift?: boolean;
  /** 押されたセルが編集中か。 */
  editing?: boolean;
}

/** ドラッグ選択を始めてよい押下か。 */
export function canStartDrag(intent: PointerIntent): boolean {
  return intent.button === 0 && intent.editing !== true;
}

/**
 * 押下時の **新しい** 範囲を返す（入力は不変）。
 * Shift 併用ならアンカーを保って伸ばし、単独なら押したセルへ畳む。座標はグリッド内へクランプ。
 */
export function beginDrag(
  range: CellRange,
  pos: CellPos,
  intent: PointerIntent,
  dims: GridDims,
): CellRange {
  // クランプは extendRangeTo が持っているので、focus 側の計算を借りて重複を避ける。
  const { focus } = extendRangeTo(range, pos, dims);
  return intent.shift === true ? { anchor: range.anchor, focus } : { anchor: focus, focus };
}
