/**
 * 作図（`mermaid` の囲み）を画像の記法へ替える。
 *
 * 画面では、出来上がったプレビューの中の囲みを直接描き替えている（renderMermaid）。
 * 画面は打鍵のたびに組み直すので、そちらは描けたものから順に差し替わるほうが速い。
 * ただし書き出し（HTML・画像・サイト）は組み上がった画面を通らないため、その経路では
 * 囲みのまま出てしまう。書き出しでは本文の段階で画像に替える。
 *
 * 描画そのものは受け取る。Mermaid 本体は大きく、また実際の画面がないと文字幅を測れない。
 */
import { collectFencedBlocks } from '../markdown/fencedBlocks';
import { toDataUri, toImageAlt, withExplicitSize } from '../markdown/svgImage';
import type { PreviewTheme } from './previewDocument';

export interface LoadMermaidOptions {
  theme: PreviewTheme;
  /** 図 1 つを SVG にする。無害化まで済んだものを返す。 */
  render: (source: string, theme: PreviewTheme) => Promise<string>;
}

export async function loadMermaidImages(
  source: string,
  options: LoadMermaidOptions,
): Promise<Map<string, string>> {
  const blocks = collectFencedBlocks(source, 'mermaid');
  const out = new Map<string, string>();
  if (blocks.length === 0) return out;

  const drawn = new Map<string, string>();
  for (const block of blocks) {
    if (block.body.trim() === '') continue;
    let svg = drawn.get(block.body);
    if (svg === undefined) {
      try {
        svg = withExplicitSize(await options.render(block.body, options.theme));
      } catch {
        // 書きかけの図で本文ごと消えないよう、描けなかったものは元の囲みを残す。
        continue;
      }
      drawn.set(block.body, svg);
    }
    out.set(block.raw, `![${toImageAlt(block.body)}](${toDataUri(svg)})`);
  }
  return out;
}
