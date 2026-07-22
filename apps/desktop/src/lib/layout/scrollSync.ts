/**
 * エディター → プレビューのスクロール追従（純ロジック）。
 *
 * カーソル行→要素の厳密写像はスキーマ駆動プレビュー（データ駆動 4 スキーマは
 * 本文行と要素が対応しない）では原理的に作れないため、Phase 1 は「スクロール割合」を
 * 両ペインで一致させる方式を採る。ここは DOM・iframe に触れず、スクロール量 ⇄ 割合の
 * 相互換算だけを担う（splitRatio / railWidth と同方針で vitest 単体テスト可能）。
 */

/** 0..1 にクランプ。NaN は 0 に倒す。 */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * スクロール位置を 0..1 の割合へ換算する。可能スクロール域
 * （scrollHeight - clientHeight）が 0 以下（内容が枠に収まる）なら 0。
 */
export function scrollFraction(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return clamp01(scrollTop / max);
}

/**
 * 0..1 の割合を対象要素のスクロール量へ戻す。スクロール不能なら 0。
 */
export function targetScrollTop(
  fraction: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return clamp01(fraction) * max;
}
