/**
 * 相手の居場所を、TSV グリッドのセルに付ける印へ変える（DOM 非依存の純ロジック）。
 *
 * - 行は行 ID で探す。行番号で引くと、並べ替えや絞り込みで印が別の行へずれる。
 * - 行 ID の無い表の居場所は行番号で届く。相手が行を挿すとずれるので `shifts` を立てる。
 * - 行 ID で届いたのにこの表に行 ID が無い・その ID や列が無い、という場所には印を付けない。
 * - 名前と色は Markdown の行の印と同じ決め方にする（同じ人は同じ色）。
 */

import { peerHue, peerLabel, type LineMarkPeer } from './lineMarks';
import type { VisiblePeer } from './peers';

export interface CellMarkPeer extends LineMarkPeer {
  /** 行番号で指された居場所。相手が行を挿すと、別の行を指していることがある。 */
  shifts: boolean;
}

export interface CellMark {
  /** 表の行番号（0 始まり）。 */
  row: number;
  /** 列番号（0 始まり）。 */
  col: number;
  peers: CellMarkPeer[];
}

/** 相手の居場所をセルごとの印にする。上の行・左の列から順に返す。 */
export function cellMarks(
  peers: readonly VisiblePeer[],
  rowIds: readonly string[],
  columns: readonly string[],
  rowCount: number,
): CellMark[] {
  const byCell = new Map<string, CellMark>();
  for (const peer of peers) {
    const { place } = peer;
    if (place.kind !== 'tsv') continue;
    const col = columns.indexOf(place.column);
    const row = 'rowId' in place ? rowIds.indexOf(place.rowId) : place.row;
    if (col < 0 || row < 0 || row >= rowCount) continue;

    const entry: CellMarkPeer = {
      who: peer.who,
      label: peerLabel(peer.who),
      hue: peerHue(peer.who),
      faded: peer.faded,
      otherBranch: peer.otherBranch,
      shifts: !('rowId' in place),
    };
    const key = `${row}:${col}`;
    const mark = byCell.get(key);
    byCell.set(key, { row, col, peers: [...(mark?.peers ?? []), entry] });
  }
  return [...byCell.values()]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((mark) => ({ ...mark, peers: [...mark.peers].sort((a, b) => a.who.localeCompare(b.who)) }));
}
