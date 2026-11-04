import { describe, expect, it } from 'vitest';
import { cellMarks } from './cellMarks';
import type { VisiblePeer } from './peers';

function peer(who: string, place: VisiblePeer['place'], extra: Partial<VisiblePeer> = {}): VisiblePeer {
  return { who, place, faded: false, otherBranch: false, ...extra };
}

const columns = ['No.', '項目', '結果'];

describe('cellMarks', () => {
  it('finds the cell by row ID and column name, so sorting does not move the mark', () => {
    const marks = cellMarks(
      [peer('alice', { kind: 'tsv', branch: 'main', rowId: 'b', column: '結果' })],
      ['a', 'b', 'c'],
      columns,
      3,
    );
    expect(marks).toEqual([
      {
        row: 1,
        col: 2,
        peers: [
          expect.objectContaining({ who: 'alice', label: 'alice', faded: false, otherBranch: false, shifts: false }),
        ],
      },
    ]);
  });

  it('uses the row number for tables without row IDs and says the place may shift', () => {
    const marks = cellMarks([peer('bob', { kind: 'tsv', branch: 'main', row: 2, column: '項目' })], [], columns, 3);
    expect(marks).toEqual([{ row: 2, col: 1, peers: [expect.objectContaining({ who: 'bob', shifts: true })] }]);
  });

  it('shows two peers on the same and on different cells, sorted', () => {
    const marks = cellMarks(
      [
        peer('carol', { kind: 'tsv', branch: 'main', rowId: 'a', column: 'No.' }),
        peer('bob', { kind: 'tsv', branch: 'main', rowId: 'c', column: '結果' }, { faded: true }),
        peer('alice', { kind: 'tsv', branch: 'dev', rowId: 'a', column: 'No.' }, { otherBranch: true }),
      ],
      ['a', 'b', 'c'],
      columns,
      3,
    );
    expect(marks.map((m) => [m.row, m.col, m.peers.map((p) => p.who)])).toEqual([
      [0, 0, ['alice', 'carol']],
      [2, 2, ['bob']],
    ]);
    expect(marks[0]?.peers[0]?.otherBranch).toBe(true);
    expect(marks[1]?.peers[0]?.faded).toBe(true);
  });

  it('skips places that are not in this copy', () => {
    const marks = cellMarks(
      [
        peer('a', { kind: 'tsv', branch: 'main', rowId: 'gone', column: '結果' }),
        peer('b', { kind: 'tsv', branch: 'main', rowId: 'a', column: '無い列' }),
        peer('c', { kind: 'tsv', branch: 'main', row: 3, column: '結果' }),
        peer('d', { kind: 'markdown', branch: 'main', line: 1 }),
      ],
      ['a', 'b', 'c'],
      columns,
      3,
    );
    expect(marks).toEqual([]);
  });

  it('cannot place a row ID in a table without row IDs', () => {
    expect(cellMarks([peer('a', { kind: 'tsv', branch: 'main', rowId: 'a', column: '結果' })], [], columns, 3)).toEqual(
      [],
    );
  });

  it('cleans names that come from the peer', () => {
    const marks = cellMarks(
      [peer('‮evil\u0007', { kind: 'tsv', branch: 'main', row: 0, column: 'No.' })],
      [],
      columns,
      1,
    );
    expect(marks[0]?.peers[0]?.label).toBe('evil');
  });

  it('does not touch the inputs', () => {
    const rowIds = ['a'];
    const cols = ['No.'];
    const peers = [peer('a', { kind: 'tsv', branch: 'main', rowId: 'a', column: 'No.' })];
    const before = JSON.stringify([rowIds, cols, peers]);
    cellMarks(peers, rowIds, cols, 1);
    expect(JSON.stringify([rowIds, cols, peers])).toBe(before);
  });
});
