/**
 * エクスプローラー（左レール）の幅リサイズ用の純ロジック
 * （DESIGN §6 レイアウト / プレビュー分割 splitRatio.ts の px 版）。
 *
 * プレビュー分割は「比率(fr)」だが、左レールは中央ペインを圧迫しすぎない範囲で
 * 「絶対 px 幅」を持つのが自然（VSCode の Explorer と同じ）。ここでは幅計算だけを
 * 純関数に切り出し、vitest で単体テストする（.svelte.ts はプレーン node で評価不可）。
 */

/** 既定幅（tokens.css の --filetree-w と一致させる）。Wクリックでこの幅へ戻す。 */
export const DEFAULT_FILETREE_W = 260;
/** 下限。これ以下だとツリー名が潰れて用をなさない。 */
export const MIN_FILETREE_W = 180;
/** 上限。中央ペイン（--pane-min 相当）を圧迫しないための頭打ち。 */
export const MAX_FILETREE_W = 480;

/**
 * 幅を [MIN, MAX] にクランプする。非数・無限大は既定幅にフォールバック。
 */
export function clampWidth(
  px: number,
  min: number = MIN_FILETREE_W,
  max: number = MAX_FILETREE_W,
): number {
  if (!Number.isFinite(px)) return DEFAULT_FILETREE_W;
  return Math.min(max, Math.max(min, px));
}

/**
 * ポインタ X 座標（ビューポート基準）とレール左端 X から、ドラッグ中の幅を求める。
 * レール左端からポインタまでの距離がそのまま幅になる。
 */
export function widthFromPointer(pointerX: number, railLeft: number): number {
  return clampWidth(pointerX - railLeft);
}

/**
 * localStorage の保存値を幅として復元する。未保存・不正値は既定幅。
 */
export function parseStoredWidth(raw: string | null): number {
  if (raw === null || raw.trim() === '') return DEFAULT_FILETREE_W;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return DEFAULT_FILETREE_W;
  return clampWidth(value);
}

/**
 * キーボード操作（←/→）用に一定 px ずつ増減する。範囲はクランプする。
 * direction: +1 で広げ、-1 で狭める。
 */
export function stepWidth(px: number, direction: 1 | -1, stepPx: number): number {
  return clampWidth(px + direction * stepPx);
}
