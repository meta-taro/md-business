/**
 * 検証グリッドの行高レイアウト（Issue 010・田中さん 2026-07-23「行の高さの可変」）。
 * ------------------------------------------------------------------
 * 列幅（{@link ./gridLayout}）と対称に、行高を明示 px として持ち行境界のドラッグで
 * 調整できるようにする。行高はテーブルセルの `height`＝**最小高**として効くので、
 * 折り返し内容がそれより高ければ内容が優先して伸びる（手動高は下限、内容は自動拡張）。
 * 既定高・クランプ・ドラッグ量・行数変化への追従を DOM 非依存の純関数として切り出す。
 */

/** 行高の下限（px）。これ未満には縮められない。 */
export const MIN_ROW_HEIGHT = 24;

/** 既定の行高（px・`tbody td` の基準高 30px に一致）。 */
export const DEFAULT_ROW_HEIGHT = 30;

/** 行数ぶんの既定高の並びを返す（初期レイアウト）。 */
export function defaultRowHeights(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, () => DEFAULT_ROW_HEIGHT);
}

/** 高さを下限でクランプする（端数は丸めて整数 px に）。 */
export function clampRowHeight(height: number, min: number = MIN_ROW_HEIGHT): number {
  return Math.max(min, Math.round(height));
}

/**
 * ドラッグ量から新しい行高を求める（開始高 + 移動量、下限クランプ）。
 * 行境界を掴んで下へ動かした距離 `dy`（px・下が正）を開始高に足す。
 */
export function resizeRowHeight(startHeight: number, dy: number, min: number = MIN_ROW_HEIGHT): number {
  return clampRowHeight(startHeight + dy, min);
}

/**
 * 指定行の高さを更新した **新しい** 配列を返す（入力は不変）。範囲外の index は無視。
 */
export function setRowHeight(heights: number[], index: number, height: number): number[] {
  if (index < 0 || index >= heights.length) return heights;
  return heights.map((h, i) => (i === index ? clampRowHeight(height) : h));
}

/**
 * 行数の変化に追従して高さ配列の長さを合わせる（既存行の手動高は保つ）。
 * 増えた分は既定高で末尾を伸ばし、減った分は末尾を切り詰める。件数が同じなら同一参照。
 * （セル編集で行数が変わらないときはリセットしないためのガード。）
 */
export function reconcileRowHeights(heights: number[], count: number): number[] {
  const n = Math.max(0, count);
  if (n === heights.length) return heights;
  if (n < heights.length) return heights.slice(0, n);
  return heights.concat(defaultRowHeights(n - heights.length));
}
