/**
 * 本文の中から図の指定（`chart` の囲み）を拾い、描いたものへ差し替える。
 *
 * 差し替えは「描き上がった絵を DOM に後から挿す」のではなく、**本文の段階で置き換える**。
 * プレビューも PDF も HTML の書き出しも同じ本文を通るので、描画の経路が 1 本で済む。
 * 後から挿す形にすると、画面には出るのに PDF には出ない、が起きる。
 */

export interface ChartBlock {
  /** 囲みごとの元の文字列。差し替えのときの目印になる。 */
  raw: string;
  /** 囲みの中身。 */
  body: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * 囲みの中の囲みは指定ではなく見本。外側の囲みを閉じるまで中は読まない。
 */
export function collectChartBlocks(source: string): ChartBlock[] {
  const lines = source.split('\n');
  const blocks: ChartBlock[] = [];
  const seen = new Set<string>();

  let index = 0;
  while (index < lines.length) {
    const opening = FENCE.exec(lines[index]);
    if (!opening) {
      index += 1;
      continue;
    }

    const marker = opening[1];
    const isChart = opening[2].trim() === 'chart';
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

    if (isChart) {
      const end = Math.min(index, lines.length - 1);
      const raw = lines.slice(start, end + 1).join('\n');
      const body = lines.slice(start + 1, index).join('\n');
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
 * 拾った囲みを、描いたものへ置き換える。渡されなかったものはそのまま残す
 * （読み込みがまだ終わっていないだけかもしれないので、消してしまわない）。
 */
export function replaceChartBlocks(source: string, rendered: ReadonlyMap<string, string>): string {
  let out = source;
  for (const [raw, html] of rendered) {
    out = out.split(raw).join(html);
  }
  return out;
}
