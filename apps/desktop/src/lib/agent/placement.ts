/**
 * エージェントの吹き出しをどこに出すか。
 *
 * 吹き出しは指している場所を隠してはいけない。上 → 下 → 右 → 左 の順に、
 * 窓の端から EDGE 以上離して入る側を選び、しっぽは対象の方へ向ける。
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type BubbleSide = 'above' | 'below' | 'right' | 'left';

export interface BubblePlacement {
  left: number;
  top: number;
  side: BubbleSide;
  /** しっぽの位置。上下に出すときは左端から、左右に出すときは上端からの距離。 */
  tail: number;
}

/** 窓の端から空ける幅。 */
export const EDGE = 8;
/** 対象と吹き出しの間。 */
export const GAP = 10;
/** しっぽを吹き出しの角から離す幅。角に付くと形が崩れる。 */
export const TAIL_INSET = 14;

/** lo を下回らない clamp。吹き出しが窓より大きいときは lo（左上）へ寄せる。 */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), Math.max(lo, hi));
}

/** 吹き出しのしっぽを向ける点。横に長い対象では左寄りを指す（文字の頭を指す方が読みやすい）。 */
export function bubbleAnchor(target: Rect): Point {
  const width = target.right - target.left;
  const height = target.bottom - target.top;
  return { x: target.left + Math.min(width / 2, 40), y: target.top + height / 2 };
}

export function bubblePlacement(target: Rect, anchor: Point, size: Size, view: Size): BubblePlacement {
  const w = size.width;
  const h = size.height;
  const fitsAbove = target.top - GAP - h >= EDGE;
  const fitsBelow = target.bottom + GAP + h <= view.height - EDGE;
  if (fitsAbove || fitsBelow) {
    const left = clamp(anchor.x - TAIL_INSET, EDGE, view.width - EDGE - w);
    return {
      left,
      top: fitsAbove ? target.top - GAP - h : target.bottom + GAP,
      side: fitsAbove ? 'above' : 'below',
      tail: clamp(anchor.x - left, TAIL_INSET, w - TAIL_INSET),
    };
  }
  const fitsRight = target.right + GAP + w <= view.width - EDGE;
  const fitsLeft = target.left - GAP - w >= EDGE;
  const side: BubbleSide = fitsRight || !fitsLeft ? 'right' : 'left';
  const left =
    side === 'right'
      ? clamp(target.right + GAP, EDGE, view.width - EDGE - w)
      : target.left - GAP - w;
  const top = clamp(anchor.y - h / 2, EDGE, view.height - EDGE - h);
  return { left, top, side, tail: clamp(anchor.y - top, TAIL_INSET, h - TAIL_INSET) };
}

/** 吹き出しを出しておく時間。読み切れる長さを文字数から決め、長すぎる文でも 20 秒で引く。 */
export function bubbleShowMs(message: string | undefined, seconds?: number): number {
  if (seconds !== undefined) return seconds * 1000;
  if (message === undefined || message === '') return 2600;
  return Math.min(20_000, 5000 + [...message].length * 100);
}
