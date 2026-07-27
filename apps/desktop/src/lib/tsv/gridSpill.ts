/**
 * スプレッドシート既定の「空セルへの突き抜け」判定（DOM 非依存）。
 * -----------------------------------------------------------------
 * 固定列幅（{@link ./gridLayout}）の clip 列でも、右隣が空セルなら Excel / Sheets 同様に
 * 長文をそのまま隣へ流して読ませる（右隣に中身があれば省略で止める）。列単位の
 * `overflow` モード（{@link ./gridColumnMode} の常時突き抜け）とは別レイヤーで、
 * 既定表示のセルごとに「その場で流してよいか」を隣接値から決める純関数。
 */

/**
 * `col` のセルが右隣へ突き抜けてよいか。
 * - 自セルが空（空白のみ含む）なら流す中身が無いので false。
 * - 末尾列は流す先が無いので false。
 * - 右隣セルが空（未定義・空白のみ含む）なら true。中身があれば false。
 */
export function spillsRight(
  rowCells: readonly string[],
  col: number,
  colCount: number,
): boolean {
  if (col < 0 || col + 1 >= colCount) return false;
  if ((rowCells[col] ?? '').trim() === '') return false;
  return (rowCells[col + 1] ?? '').trim() === '';
}
