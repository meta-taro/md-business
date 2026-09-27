/**
 * 本文の囲み（```〜```）から、決まった名前のものだけを拾い、別の書き方へ置き換える。
 *
 * 置き換えは「描き上がったものを DOM に後から挿す」のではなく、**本文の段階で行う**。
 * プレビューも PDF も書き出しも同じ本文を通るので、描画の経路が 1 本で済む。
 * 後から挿す形にすると、画面には出るのに書き出すと消える、が起きる。
 *
 * 図（chart）と作図（mermaid）で同じ拾い方をするため、ここに 1 つだけ置く。
 */

export interface FencedBlock {
  /** 囲みごとの元の文字列。差し替えのときの目印になる。 */
  raw: string;
  /** 囲みの中身。改行は LF に揃えてある。 */
  body: string;
}

// 行末の復帰文字も囲みの一部として読む。Windows で作った本文は改行が CRLF で、
// 正規表現の `.` は復帰文字を拾わない。見込んでおかないと囲みが 1 つも見つからず、
// 図も表も構成図も囲みのまま出る。
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)\r?$/;

const CR = '\r';

function withoutCr(line: string): string {
  return line.endsWith(CR) ? line.slice(0, -1) : line;
}

/**
 * 囲みの中の囲みは中身ではなく見本。外側の囲みを閉じるまで中は読まない。
 */
export function collectFencedBlocks(source: string, lang: string): FencedBlock[] {
  const lines = source.split('\n');
  const blocks: FencedBlock[] = [];
  const seen = new Set<string>();

  let index = 0;
  while (index < lines.length) {
    const opening = FENCE.exec(lines[index]);
    if (!opening) {
      index += 1;
      continue;
    }

    const marker = opening[1];
    const wanted = opening[2].trim() === lang;
    const start = index;
    index += 1;

    while (index < lines.length) {
      const closing = FENCE.exec(lines[index]);
      if (
        closing &&
        closing[1][0] === marker[0] &&
        closing[1].length >= marker.length &&
        closing[2].trim() === ''
      ) {
        break;
      }
      index += 1;
    }

    if (wanted) {
      const end = Math.min(index, lines.length - 1);
      // 目印は本文のままでないと差し替えられないので触らない。中身のほうは読み手
      // （YAML の読み取り・題名の取り出し）へ渡るので、こちらだけ改行を揃える。
      const raw = lines.slice(start, end + 1).join('\n');
      const body = lines
        .slice(start + 1, index)
        .map(withoutCr)
        .join('\n');
      if (!seen.has(raw)) {
        seen.add(raw);
        blocks.push({ raw, body });
      }
    }

    index += 1;
  }

  return blocks;
}

/**
 * 拾った囲みを置き換える。渡されなかったものはそのまま残す
 * （読み込みがまだ終わっていないだけかもしれないので、消してしまわない）。
 */
export function replaceFencedBlocks(source: string, rendered: ReadonlyMap<string, string>): string {
  let out = source;
  for (const [raw, replacement] of rendered) {
    out = out.split(raw).join(replacement);
  }
  return out;
}
