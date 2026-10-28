/**
 * frontmatter の最上位キーが何行目にあるかを引く。
 *
 * スキーマ検証のエラーは JSON Pointer（`/items/0/name`）で場所を返すが、
 * 行番号は持たない。「問題」パネルへ出すには行が要るので、エラーの先頭の
 * セグメントを最上位キーの行へ対応させる。入れ子の中まで追わないのは、
 * YAML を行単位で追うと複数行の値やフロー記法で必ずずれるため。
 * 最上位キーまでなら行頭の形だけで確実に拾える。
 */

const KEY_LINE = /^(?:'([^']*)'|"([^"]*)"|([^\s#'"][^:]*?))\s*:(?:\s|$)/;

/** 最上位キー → 1 始まりのファイル行。frontmatter が無ければ空。 */
export function topLevelKeyLines(text: string): Map<string, number> {
  const result = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return result;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '---') break;
    const m = KEY_LINE.exec(line);
    if (!m) continue;
    const key = m[1] ?? m[2] ?? m[3] ?? '';
    if (!result.has(key)) result.set(key, i + 1);
  }
  return result;
}

/**
 * JSON Pointer の場所を 1 始まりの行へ。キーが見つからなければ `schema` 宣言の行、
 * それも無ければ 1 行目（文書全体の問題として先頭に出す）。
 */
export function lineForPath(text: string, path: string): number {
  const lines = topLevelKeyLines(text);
  const first = path.split('/')[1];
  if (first) {
    const key = first.replace(/~1/g, '/').replace(/~0/g, '~');
    const line = lines.get(key);
    if (line !== undefined) return line;
  }
  return lines.get('schema') ?? lines.get('schemaVersion') ?? 1;
}
