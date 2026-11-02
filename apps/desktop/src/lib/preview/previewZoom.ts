/**
 * プレビューの表示倍率。
 *
 * 倍率は段で刻む。自由な値にすると、拡大と縮小を往復したときに 100% へ戻れなくなる。
 * 段はブラウザの拡大と同じ並びにしてある（同じ操作で同じ値になる）。
 */

import type { ShortcutEvent, ZoomAction } from '$lib/layout/shortcuts';

const STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

export const DEFAULT_ZOOM = 1;
export const MIN_ZOOM = STEPS[0];
export const MAX_ZOOM = STEPS[STEPS.length - 1]!;

/** 保存先。分割位置と同じく端末ごとに覚える。 */
export const PREVIEW_ZOOM_STORAGE_KEY = 'md-business:desktop:preview-zoom';

/** 今より大きい最初の段。段の間の値（保存値など）からも次の段へ寄せる。 */
export function zoomIn(zoom: number): number {
  return STEPS.find((step) => step > zoom + 1e-9) ?? MAX_ZOOM;
}

/** 今より小さい最後の段。 */
export function zoomOut(zoom: number): number {
  return [...STEPS].reverse().find((step) => step < zoom - 1e-9) ?? MIN_ZOOM;
}

/** 保存値を読む。壊れた値・範囲外は既定へ戻す（極端な倍率のまま開くと戻し方が分からない）。 */
export function parseStoredZoom(raw: string | null): number {
  if (raw === null) return DEFAULT_ZOOM;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < MIN_ZOOM || value > MAX_ZOOM) return DEFAULT_ZOOM;
  return value;
}

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/**
 * 表示倍率のキー。Ctrl / Cmd と組み合わせる。
 *
 * 拡大の `+` は配列によって Shift が要る（US は Shift+=、日本語配列は Shift+;）。
 * Shift 付きでも当てないと、日本語配列では拡大が押せない。`=` と `;` は Shift 無しの同じキー。
 */
export function matchZoomShortcut(event: ShortcutEvent): ZoomAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  switch (event.key) {
    case '=':
    case '+':
    case ';':
      return 'zoomIn';
    case '-':
      return event.shiftKey ? null : 'zoomOut';
    case '0':
      return event.shiftKey ? null : 'zoomReset';
    default:
      return null;
  }
}
