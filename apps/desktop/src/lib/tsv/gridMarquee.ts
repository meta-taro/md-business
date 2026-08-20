// コピーした範囲を点線で囲むための純ロジック（DOM 非依存・vitest 単体テスト層）。
//
// 表計算では Ctrl+C の直後に控えた範囲が点線で囲まれる。どこを控えたのかが見えないと、
// 貼り付ける前に「本当にコピーできたのか」を確かめる手立てが無い。選択の枠とは別物なので、
// 実線のリング（選択）に対して点線（控え）で描き分ける。
//
// 枠はセルごとに、その辺が範囲の外周に接しているかで引く。範囲全体を覆う 1 枚の図形は、
// 行を間引いて描いている表では位置を出せない（画面に無い行の高さが分からない）。

import { rangeBounds, type CellRange } from './gridRange';

/** セル 1 つについて、点線を引く辺。 */
export interface MarqueeEdges {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

/** どの辺も引かない（範囲の外・控えなし）。 */
export const NO_EDGES: MarqueeEdges = { top: false, right: false, bottom: false, left: false };

/**
 * 控えた範囲の外周のうち、セル (row, col) が受け持つ辺を返す。
 * 範囲外・控えなしは {@link NO_EDGES}。
 */
export function marqueeEdges(range: CellRange | null, row: number, col: number): MarqueeEdges {
  if (range === null) return NO_EDGES;
  const { r0, c0, r1, c1 } = rangeBounds(range);
  if (row < r0 || row > r1 || col < c0 || col > c1) return NO_EDGES;
  return { top: row === r0, right: col === c1, bottom: row === r1, left: col === c0 };
}
