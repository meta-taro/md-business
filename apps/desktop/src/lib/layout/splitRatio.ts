/**
 * 中央 2 分割ペインの幅比率（左ペインの占有率 0〜1）を扱う純ロジック。
 *
 * ドラッグ / キーボード / localStorage 復元のいずれも、最終的にこの clamp を
 * 通して「両ペインが最小幅を割らない」不変条件を保証する。DOM に触れないので
 * 単体テストできる（描画側 +page.svelte が本関数を使って grid 列幅を導出する）。
 */

/** 既定は 50/50。ダブルクリック / 不正値フォールバックの復帰先。 */
export const DEFAULT_SPLIT_RATIO = 0.5;

/** ドラッグ時に各ペインへ確保する最小幅(px)。トークン --pane-min(360) より緩め。 */
export const MIN_PANE_PX = 240;

/**
 * 比率を [minPanePx/containerWidth, 1 - minPanePx/containerWidth] にクランプする。
 * コンテナが狭すぎて両ペインの最小を満たせない、または入力が不正な場合は既定比。
 */
export function clampRatio(
  ratio: number,
  containerWidth: number,
  minPanePx: number = MIN_PANE_PX,
): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO;
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return DEFAULT_SPLIT_RATIO;

  const minRatio = minPanePx / containerWidth;
  const maxRatio = 1 - minRatio;
  // 解が無い（コンテナが 2*minPanePx 未満）→ 中央で妥協。
  if (minRatio >= maxRatio) return DEFAULT_SPLIT_RATIO;

  return Math.min(Math.max(ratio, minRatio), maxRatio);
}

/**
 * ポインタの X 座標（ビューポート基準）を、コンテナ内の左ペイン比率へ換算し
 * クランプして返す。containerLeft はコンテナの getBoundingClientRect().left。
 */
export function ratioFromPointer(
  pointerX: number,
  containerLeft: number,
  containerWidth: number,
  minPanePx: number = MIN_PANE_PX,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return DEFAULT_SPLIT_RATIO;
  const raw = (pointerX - containerLeft) / containerWidth;
  return clampRatio(raw, containerWidth, minPanePx);
}

/**
 * localStorage 等から復元した文字列を検証して比率に戻す。null / 非数 / (0,1)
 * の開区間外は既定比。※境界の 0 / 1 は片ペイン消滅なので無効扱い。
 */
export function parseStoredRatio(raw: string | null): number {
  if (raw === null || raw === '') return DEFAULT_SPLIT_RATIO;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_SPLIT_RATIO;
  if (value <= 0 || value >= 1) return DEFAULT_SPLIT_RATIO;
  return value;
}

/**
 * キーボード操作。direction(+1: 右へ=左ペイン拡大 / -1: 左へ) に stepPx 相当だけ
 * 比率を動かし、クランプして返す。
 */
export function stepRatio(
  ratio: number,
  direction: 1 | -1,
  containerWidth: number,
  stepPx: number,
  minPanePx: number = MIN_PANE_PX,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return DEFAULT_SPLIT_RATIO;
  const delta = (direction * stepPx) / containerWidth;
  return clampRatio(ratio + delta, containerWidth, minPanePx);
}
