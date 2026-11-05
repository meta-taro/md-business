/**
 * 強調・取り消し線にならず、記号のまま刷られてしまう `**` / `__` / `~~` を知らせる。
 *
 * 描画と同じ解釈（全角の約物に接した強調を認める）で本文を読み、地の文に残った記号だけを拾う。
 * 記号が残るのは、閉じ忘れか、記号のすぐ内側に空白があるとき。どちらも見た目では
 * 気づきにくく、PDF にしてから記号が刷られているのに気づく。
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkCjkFriendlyGfmStrikethrough from 'remark-cjk-friendly-gfm-strikethrough';
import type { Nodes, Root } from 'mdast';
import { splitFrontmatter } from './frontmatter.js';

/** これより多いときは数だけ伝える（全部並べても直す順は変わらない）。 */
const MAX_REPORTED = 10;
/** 場所を探す手がかりに添える前後の文字数。 */
const EXCERPT = 8;

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkCjkFriendly)
  .use(remarkCjkFriendlyGfmStrikethrough);

/** 改版の印の区切り。中身の位置を変えずに、記号として拾われないよう伏せる。 */
const REVISION_DELIMITER = /\{\+\+|\+\+\}|\{--|--\}|\{~~|~>|~~\}|\{==|==\}|\{>>|<<\}/g;
/** エスケープされていない記号の並び。 */
const MARKER = /(?<!\\)(?:\*{2,}|_{2,}|~{2,})/g;
const ASCII_WORD = /[A-Za-z0-9]/;
const SPACE = /\s/;

function hint(marker: string, before: string, after: string): string {
  // `_` は前後が文字のとき開きも閉じもしない（`snake_case` を守るための規則）。
  // 日本語は語の間に空白を置かないので、`__強調__` はほぼ必ずこれに当たる。
  if (marker[0] === '_' && before !== '' && after !== '' && !SPACE.test(before) && !SPACE.test(after)) {
    return '日本語に接した `__` は強調になりません。`**` で囲んでください。';
  }
  const spaceBefore = before === '' || SPACE.test(before);
  const spaceAfter = after === '' || SPACE.test(after);
  if (spaceAfter && !spaceBefore) {
    return '閉じる記号のすぐ前に空白があれば詰めてください（`**強調 **` → `**強調**`）。無ければ開く記号が抜けています。';
  }
  if (spaceBefore && !spaceAfter) {
    return '対になる閉じる記号がありません。閉じ忘れか、閉じる記号のすぐ前に空白があります。';
  }
  return '対になる記号がありません。閉じ忘れか、余分な記号です。';
}

function textSpans(tree: Root): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const walk = (node: Nodes): void => {
    if (node.type === 'text') {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) spans.push([start, end]);
      return;
    }
    if ('children' in node) for (const child of node.children) walk(child as Nodes);
  };
  walk(tree);
  return spans;
}

/**
 * 記号のまま刷られる箇所ごとに 1 文を返す。行番号は frontmatter を含めたファイルの行。
 * frontmatter の無い本文だけを渡してもよい。
 */
export function emphasisWarnings(source: string): string[] {
  const { body } = splitFrontmatter(source);
  const prefix = source.slice(0, source.length - body.length);
  const firstLine = prefix.split('\n').length;
  const text = body.replace(REVISION_DELIMITER, (m) => 'x'.repeat(m.length));

  const found: string[] = [];
  let total = 0;
  for (const [start, end] of textSpans(parser.parse(text))) {
    for (const hit of text.slice(start, end).matchAll(MARKER)) {
      const at = start + (hit.index ?? 0);
      const marker = hit[0];
      const before = text[at - 1] ?? '';
      const after = text[at + marker.length] ?? '';
      // `__init__` や `snake__case` は識別子で、強調のつもりではない。
      if (marker[0] === '_' && (ASCII_WORD.test(before) || ASCII_WORD.test(after))) continue;
      total++;
      if (found.length >= MAX_REPORTED) continue;

      const lineStart = body.lastIndexOf('\n', at - 1) + 1;
      const lineEndRaw = body.indexOf('\n', at);
      const lineEnd = lineEndRaw === -1 ? body.length : lineEndRaw;
      const line = firstLine + (body.slice(0, at).match(/\n/g)?.length ?? 0);
      const from = Math.max(lineStart, at - EXCERPT);
      const to = Math.min(lineEnd, at + marker.length + EXCERPT);
      const excerpt = body.slice(from, to).trim();
      found.push(
        `${line} 行目: 「${marker}」が強調にならず、記号のまま刷られます（${excerpt}）。${hint(marker, before, after)}`,
      );
    }
  }
  if (total > found.length) found.push(`ほか ${total - found.length} か所で、記号のまま刷られます。`);
  return found;
}
