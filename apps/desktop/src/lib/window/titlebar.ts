/*
 * 自作タイトルバー（フレームレス）の純ロジック。
 * ------------------------------------------------------------------
 * DOM / Tauri IPC には一切依存しない＝ここだけを単体テストの対象にする。
 * 実際のウィンドウ操作（最小化 / 最大化トグル / 閉じる / ドラッグ）は
 * titlebar.svelte.ts が @tauri-apps/api 経由で行い、ブラウザ実行時は no-op でガードする。
 */

export type WindowControlId = 'minimize' | 'maximize' | 'close';

export interface WindowControlDef {
  id: WindowControlId;
  /** aria-label / title に使う日本語ラベル（maximize は非最大化時の既定）。 */
  label: string;
  /** ボタングリフ（maximize は非最大化時の既定。最大化時は maximizeGlyph で上書き）。 */
  glyph: string;
}

/** 並び順は Windows 慣習（最小化 → 最大化 → 閉じる）。 */
export const WINDOW_CONTROLS: readonly WindowControlDef[] = [
  { id: 'minimize', label: '最小化', glyph: '─' },
  { id: 'maximize', label: '最大化', glyph: '▢' },
  { id: 'close', label: '閉じる', glyph: '✕' },
] as const;

/** 最大化ボタンのグリフ（最大化中は「元に戻す」表現へ切替）。 */
export function maximizeGlyph(isMaximized: boolean): string {
  return isMaximized ? '❐' : '▢';
}

/** 最大化ボタンのラベル（最大化中は「元のサイズに戻す」）。 */
export function maximizeLabel(isMaximized: boolean): string {
  return isMaximized ? '元のサイズに戻す' : '最大化';
}
