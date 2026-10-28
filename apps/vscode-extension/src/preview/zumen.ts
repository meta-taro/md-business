/**
 * 構成図（`zumen` の囲み）を画像の記法へ替えてから webview へ渡す。
 *
 * 描くのは拡張ホスト側で行う。図の組み立ては重く、webview の CSP の内側へ持ち込む理由もない。
 * 出来上がりは data URI の画像なので、SVG の中身が webview で動くことはない。
 *
 * 拾い方・貼り替え方はデスクトップアプリと同じものを使う。経路を分けると、同じ文書が
 * アプリと VS Code で違う絵になる。
 */
import { toSvg } from '@metataro/zumen';

import { replaceFencedBlocks } from '../../../desktop/src/lib/markdown/fencedBlocks.js';
import { loadZumenImages } from '../../../desktop/src/lib/preview/zumenBlocks.js';

export interface DrawOptions {
  theme: 'light' | 'dark';
}

export type DrawZumen = (source: string, options: DrawOptions) => Promise<string>;

export const drawZumen: DrawZumen = (source, options) => toSvg(source, options);

export async function composeZumen(text: string, draw: DrawZumen): Promise<string> {
  // プレビューの紙は利用者の配色に関わらず白いので、図も明るい配色で描く。
  const images = await loadZumenImages(text, {
    theme: 'light',
    render: (source, theme) => draw(source, { theme }),
    describe: (message) => `構成図を描けません。${message}`,
  });
  return images.size === 0 ? text : replaceFencedBlocks(text, images);
}
