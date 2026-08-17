import { resolveTheme } from '@md-business/renderer-pdf';

/**
 * テーマ指定が読めなかったことを知らせる。
 *
 * 読めない指定は既定の配色で描く（描画は止めない）。ただし黙って落とすと、
 * 色が変わらない理由が「指定が効いていない」のか「そういう色」なのかが
 * 画面から分からない。書き方も添えて、その場で直せるようにする。
 */

/** 警告欄を 1 件で埋めないための上限。 */
const MAX_SHOWN = 24;

function shorten(input: string): string {
  return input.length <= MAX_SHOWN ? input : `${input.slice(0, MAX_SHOWN)}…`;
}

export function themeWarnings(theme: unknown): string[] {
  const resolved = resolveTheme(theme);
  if (resolved.kind !== 'unknown') return [];
  return [
    `テーマ「${shorten(resolved.input)}」は選べる名前ではありません。` +
      '既定の配色で表示しています（青 / 赤 / 黄 / 橙 / 紫 / 黒 / 灰、または #2a4d7a のような 16 進の色）。',
  ];
}
