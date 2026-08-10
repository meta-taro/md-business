/**
 * Markdown の見出しを文字列で引く。
 *
 * 検証シートから「詳細は基本設計書のこの節」と指すために使う。行番号で指さないのは、
 * 節を 1 つ足しただけで全部ずれるため。見出しの文字列なら、差分を読んだ人にも
 * 何を指していたかが分かり、節が動いても追随する。
 */

/** `#` 〜 `######` + 空白 + 見出し文字列。空白を必須にして `#見出し` を除く。 */
const HEADING_PATTERN = /^ {0,3}(#{1,6})\s+(.*)$/;

/** ``` / ~~~ の囲い。囲いの中の `# …` はコマンドのコメントであって見出しではない。 */
const FENCE_PATTERN = /^ {0,3}(```|~~~)/;

/** 見出し行末尾の閉じ `#`（`## まとめ ##`）。書いた人が指したいのは文字のほうだけ。 */
const CLOSING_HASHES = /\s+#+\s*$/;

/**
 * 見出しの文字列から、その行の先頭の文字位置を返す。見つからなければ null。
 *
 * 同じ見出しが複数あるときは最初のものを返す。曖昧なまま動かないより、動いて
 * 上から順に見てもらうほうが早い。
 */
export function findHeadingOffset(source: string, heading: string): number | null {
  const wanted = heading.trim();
  if (wanted === '') return null;

  let offset = 0;
  let fenced = false;
  for (const line of source.split('\n')) {
    if (FENCE_PATTERN.test(line)) {
      fenced = !fenced;
    } else if (!fenced) {
      const text = HEADING_PATTERN.exec(line)?.[2];
      if (text !== undefined && text.replace(CLOSING_HASHES, '').trim() === wanted) return offset;
    }
    offset += line.length + 1; // 改行ぶん
  }
  return null;
}
