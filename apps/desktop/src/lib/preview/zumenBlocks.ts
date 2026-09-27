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

/**
 * 図そのものの題名。行頭にあるものだけを拾う（`title` は図の中の部品にも書ける）。
 */
function titleOf(body: string): string | null {
  const found = /^title:[ \t]*(.+?)[ \t]*$/m.exec(body);
  if (found === null) return null;
  // YAML は値を引用符で囲める。囲みは書式であって題名の一部ではない。
  return found[1].replace(/^(['"])([\s\S]*)\1$/, '$2');
}

/**
 * 画像の説明（alt）。読み上げに使われ、画像が出ないときはこれが代わりに出る。
 *
 * 共通の作法は「中身のいちばん上の行」だが、構成図のいちばん上は `version: 1` で、
 * どの図なのかを何も伝えない。構成図には題名があるので、あればそちらを使う。
 */
function altOf(body: string): string {
  return toImageAlt(titleOf(body) ?? body);
}

/**
 * 図の下に出す説明。Markdown の画像に書ける題名として渡す。
 *
 * 題名は図の中に描かれないので、書いてもこれまでどこにも出ていなかった。下に出せば、
 * 本文を追っている人がその図が何かを図のそばで読める。
 * 題名が無いときは何も付けない（中身の無い説明欄が図の下に残る）。
 */
function captionOf(body: string): string {
  const title = titleOf(body);
  if (title === null) return '';
  // 引用符で囲むので、中の引用符と逆斜線は逃がす。閉じが早まると記法ごと壊れる。
  return ` "${title.replace(/[\\"]/g, '\\$&')}"`;
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
    out.set(block.raw, `![${altOf(block.body)}](${toDataUri(svg)}${captionOf(block.body)})`);
  }
  return out;
}
