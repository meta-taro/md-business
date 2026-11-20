/**
 * 楽譜（`abc` の囲み）を画像の記法へ替える。
 *
 * ABC 記法は、音符を文字で書く楽譜の書き方。`T:` の行が曲名、`K:` の行が調になる。
 *
 * 置き換えは構成図と同じく**本文の段階で行う**。プレビューも PDF も書き出しも同じ本文を
 * 通るので、画面には出るのに書き出すと消える、が起きない。
 *
 * 描き手は受け取る。ここは囲みを拾って貼り替えるところまでを持ち、譜面の組み方は知らない。
 * **描き手を渡さない限り、囲みはそのまま残る。**
 *
 * 描けなかったものは黙って空にしない。理由をその位置に出し、書いた譜面もそのまま残す。
 */
import { blockFailure } from '../blockNote.js';
import { collectFencedBlocks } from '../fencedBlocks.js';
import { toDataUri, toImageAlt, withExplicitSize } from '../svgImage.js';

/** 明るい面か暗い面か。 */
export type AbcTheme = 'light' | 'dark';

export interface LoadAbcOptions {
  /**
   * 明るい面か暗い面か。
   *
   * 書き出した SVG は CSS 変数を使えないので、線と音符の色は描くときに決まる。
   */
  theme: AbcTheme;
  /** 譜面 1 つを SVG にする。 */
  render: (source: string, theme: AbcTheme) => Promise<string>;
  /** 描けなかった理由を 1 文にする。文言は呼ぶ側の訳語に任せる。 */
  describe: (message: string) => string;
}

/**
 * 画像の説明（alt）。曲名があればそれを使う。
 *
 * 譜面のいちばん上は `X:1`（曲の通し番号）で、どの曲なのかを何も伝えない。
 * 曲名は譜面の上に描かれるので、図の下の説明としては付けない（同じ名前が 2 度並ぶ）。
 */
function altOf(body: string): string {
  const title = /^T:[ \t]*(.+?)[ \t]*$/m.exec(body);
  return toImageAlt(title?.[1] ?? body);
}

export async function loadAbcImages(
  source: string,
  options: LoadAbcOptions,
): Promise<Map<string, string>> {
  const blocks = collectFencedBlocks(source, 'abc');
  const out = new Map<string, string>();
  if (blocks.length === 0) return out;

  // 同じ譜面が並ぶことがある（練習用に繰り返し貼る）。組むのは 1 度でよい。
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
    out.set(block.raw, `![${altOf(block.body)}](${toDataUri(svg)})`);
  }
  return out;
}
