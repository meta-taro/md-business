/**
 * 計算列（`#@ computed`）のグリッド側の補助。
 *
 * 宣言の読み取りと算出値の適用そのものは共有パッケージ
 * （`@md-business/schema-test-spec-tsv` の `readComputedColumns` / `applyComputed`）にある。
 * MCP 経由の書き込みでも同じ判定が要るため、判定はそちらが正本。
 * ここに残すのは、クリップボード貼り付けという **グリッドにしかない経路** の数え上げだけ。
 */
import type { CellPos } from './gridNav';

/**
 * 貼り付け矩形のうち計算列に当たるセル数。落とした件数を貼った側へ知らせるために数える
 * （黙って落とすと、貼れたつもりのまま先へ進んでしまう）。
 * 列は固定なので、右へ溢れたぶんは貼り付け自体が切り捨てる＝数えない。
 */
export function countLockedPasteCells(
  matrix: readonly (readonly string[])[],
  anchor: CellPos,
  locked: ReadonlySet<number>,
  colCount: number,
): number {
  let count = 0;

  for (const cells of matrix) {
    for (let j = 0; j < cells.length; j += 1) {
      const col = anchor.col + j;
      if (col < colCount && locked.has(col)) count += 1;
    }
  }

  return count;
}
