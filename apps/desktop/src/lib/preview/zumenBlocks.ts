/**
 * 構成図（`zumen` の囲み）を画像の記法へ替える。
 *
 * 置き換えは**本文の段階で行う**。出来上がった画面へ後から挿す形にすると、画面には出るのに
 * 書き出すと消える。プレビューも PDF も書き出しも同じ本文を通れば、経路が 1 本で済む。
 *
 * 描き手は受け取る。ここは囲みを拾って貼り替えるところまでを持ち、図の描き方は知らない
 * （作図（mermaid）と同じ形）。**描き手を渡さない限り、囲みはそのまま残る。**
 *
 * 描けなかったものは**黙って空にしない**。理由をその位置に出し、書いた指定もそのまま残す
 * （表の囲みと同じ作法）。消すと、書いた人は「描けている」と思ったまま気づかない。
 */
import { blockFailure } from '../markdown/blockNote';
import { collectFencedBlocks } from '../markdown/fencedBlocks';
import { toDataUri, toImageAlt, withExplicitSize } from '../markdown/svgImage';
import type { PreviewTheme } from './previewDocument';

export interface LoadZumenOptions {
  /**
   * 明るい面か暗い面か。
   *
   * 書き出した SVG は CSS 変数を使えない（貼り先にこのアプリの CSS が無い）ので、色は
   * 描くときに決まる。渡さないと、暗い面でも明るい面の色のまま出る。
   */
  theme: PreviewTheme;
  /** 図 1 つを SVG にする。 */
  render: (source: string, theme: PreviewTheme) => Promise<string>;
  /** 描けなかった理由を 1 文にする。文言はここで決めず、呼ぶ側の訳語に任せる。 */
  describe: (message: string) => string;
}

export async function loadZumenImages(
  source: string,
  options: LoadZumenOptions,
): Promise<Map<string, string>> {
  const blocks = collectFencedBlocks(source, 'zumen');
  const out = new Map<string, string>();
  if (blocks.length === 0) return out;

  // 同じ図が並ぶことがある。組み立ては重いので、描くのは 1 度でよい。
  const drawn = new Map<string, string>();

  for (const block of blocks) {
    if (block.body.trim() === '') continue;

    let svg = drawn.get(block.body);
    if (svg === undefined) {
      try {
        svg = withExplicitSize(await options.render(block.body, options.theme));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        out.set(block.raw, blockFailure(options.describe(message), block.raw));
        continue;
      }
      drawn.set(block.body, svg);
    }
    out.set(block.raw, `![${toImageAlt(block.body)}](${toDataUri(svg)})`);
  }
  return out;
}
