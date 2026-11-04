import { describe, expect, it } from 'vitest';
import { MAX_LABEL_CHARS, lineMarks, peerHue, peerLabel } from './lineMarks';
import type { VisiblePeer } from './peers';

function markdownPeer(who: string, line: number, extra: Partial<VisiblePeer> = {}): VisiblePeer {
  return { who, place: { kind: 'markdown', branch: 'main', line }, faded: false, otherBranch: false, ...extra };
}

describe('peerHue', () => {
  it('gives the same person the same colour on every machine', () => {
    expect(peerHue('alice')).toBe(peerHue('alice'));
    expect(peerHue('alice')).toBeGreaterThanOrEqual(0);
    expect(peerHue('alice')).toBeLessThan(360);
  });

  it('usually tells two people apart', () => {
    expect(peerHue('alice')).not.toBe(peerHue('bob'));
  });
});

describe('peerLabel', () => {
  it('keeps short names as they are', () => {
    expect(peerLabel('田中')).toBe('田中');
  });

  it('cuts long names by characters and shows that it did', () => {
    const label = peerLabel('あ'.repeat(40));
    expect([...label]).toHaveLength(MAX_LABEL_CHARS);
    expect(label.endsWith('…')).toBe(true);
  });

  it('drops control and direction characters, which could make one name look like another', () => {
    expect(peerLabel('ali‮ce\u0007')).toBe('alice');
  });

  it('still shows something when nothing printable is left', () => {
    expect(peerLabel('​')).toBe('?');
  });
});

describe('lineMarks', () => {
  it('puts two people on their own lines, top to bottom', () => {
    const marks = lineMarks([markdownPeer('bob', 5), markdownPeer('alice', 2)], 10);
    expect(marks.map((mark) => mark.line)).toEqual([2, 5]);
    expect(marks[0]?.peers.map((peer) => peer.label)).toEqual(['alice']);
  });

  it('gathers people on the same line into one mark, in name order', () => {
    const marks = lineMarks([markdownPeer('bob', 3), markdownPeer('alice', 3)], 10);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.peers.map((peer) => peer.label)).toEqual(['alice', 'bob']);
  });

  it('carries the faded and other-branch signs through', () => {
    const [mark] = lineMarks([markdownPeer('alice', 1, { faded: true, otherBranch: true })], 3);
    expect(mark?.peers[0]).toMatchObject({ faded: true, otherBranch: true });
  });

  it('skips lines this copy of the document does not have', () => {
    expect(lineMarks([markdownPeer('alice', 11), markdownPeer('bob', 0)], 10)).toEqual([]);
  });

  it('ignores places in a table', () => {
    const tsv: VisiblePeer = {
      who: 'alice',
      place: { kind: 'tsv', branch: 'main', rowId: 'r1', column: 'A' },
      faded: false,
      otherBranch: false,
    };
    expect(lineMarks([tsv], 10)).toEqual([]);
  });
});
