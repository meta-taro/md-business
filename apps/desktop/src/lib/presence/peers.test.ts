import { describe, expect, it } from 'vitest';
import { applyUpdate, prunePeers, visiblePeers, type PeerTable } from './peers';

const md = (line: number, branch = 'main') => ({ kind: 'markdown', branch, line }) as const;
const DOC = 'github.com/o/r#a.md';

describe('peers', () => {
  it('shows each peer at their latest place in the chosen room', () => {
    let table: PeerTable = new Map();
    table = applyUpdate(table, { who: 'A', document: DOC, place: md(1), room: 'R' }, 0);
    table = applyUpdate(table, { who: 'A', document: DOC, place: md(5), room: 'R' }, 100);
    table = applyUpdate(table, { who: 'B', document: DOC, place: md(9), room: 'R' }, 100);
    table = applyUpdate(table, { who: 'C', document: DOC, place: md(2), room: 'other' }, 100);
    table = applyUpdate(table, { who: 'D', document: 'github.com/o/r#b.md', place: md(2), room: 'R' }, 100);

    expect(visiblePeers(table, { document: DOC, room: 'R', branch: 'main' }, 200)).toEqual([
      { who: 'A', place: md(5), faded: false, otherBranch: false },
      { who: 'B', place: md(9), faded: false, otherBranch: false },
    ]);
  });

  it('removes a peer who closed the document', () => {
    let table: PeerTable = new Map();
    table = applyUpdate(table, { who: 'A', document: DOC, place: md(1), room: 'R' }, 0);
    table = applyUpdate(table, { who: 'A', document: DOC, place: null, room: 'R' }, 10);
    expect(visiblePeers(table, { document: DOC, room: 'R', branch: 'main' }, 20)).toEqual([]);
  });

  it('marks a peer on another branch', () => {
    const table = applyUpdate(new Map(), { who: 'A', document: DOC, place: md(1, 'feat'), room: 'R' }, 0);
    expect(visiblePeers(table, { document: DOC, room: 'R', branch: 'main' }, 0)[0]?.otherBranch).toBe(true);
  });

  it('fades a peer silent for 45 s and drops them after 2 min, since a crashed peer sends no "closed"', () => {
    const table = applyUpdate(new Map(), { who: 'A', document: DOC, place: md(1), room: 'R' }, 0);
    const view = { document: DOC, room: 'R', branch: 'main' };
    expect(visiblePeers(table, view, 44_999)[0]?.faded).toBe(false);
    expect(visiblePeers(table, view, 45_000)[0]?.faded).toBe(true);
    expect(visiblePeers(table, view, 120_000)).toEqual([]);
    expect(prunePeers(table, 119_999).size).toBe(1);
    expect(prunePeers(table, 120_000).size).toBe(0);
  });

  it('does not change the table it was given', () => {
    const table: PeerTable = new Map();
    applyUpdate(table, { who: 'A', document: DOC, place: md(1), room: 'R' }, 0);
    expect(table.size).toBe(0);
  });
});
