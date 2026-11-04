import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { peerMarksField, setPeerMarks } from './peerMarksField';
import { createFakeHub } from '../presence/fakeGateway';
import { applyUpdate, visiblePeers, type PeerTable } from '../presence/peers';
import { lineMarks, type LineMark } from '../presence/lineMarks';

interface Found {
  from: number;
  kind: 'line' | 'widget';
}

function decorationsOf(state: EditorState): Found[] {
  const set: DecorationSet = state.field(peerMarksField);
  const found: Found[] = [];
  set.between(0, state.doc.length, (from, _to, deco) => {
    found.push({ from, kind: deco.spec.widget ? 'widget' : 'line' });
  });
  return found;
}

const alice: LineMark = {
  line: 2,
  peers: [{ who: 'alice', label: 'alice', hue: 10, faded: false, otherBranch: false }],
};

function stateWith(doc: string, marks: LineMark[]): EditorState {
  const state = EditorState.create({ doc, extensions: [peerMarksField] });
  return state.update({ effects: setPeerMarks.of({ marks, otherBranchNote: '' }) }).state;
}

describe('peerMarksField', () => {
  it('marks the line and puts the name at its end', () => {
    const state = stateWith('one\ntwo\nthree', [alice]);
    expect(decorationsOf(state)).toEqual([
      { from: 4, kind: 'line' },
      { from: 7, kind: 'widget' },
    ]);
  });

  it('follows the line when text is typed above it', () => {
    const state = stateWith('one\ntwo\nthree', [alice]);
    const typed = state.update({ changes: { from: 0, insert: 'zero\n' } }).state;
    expect(decorationsOf(typed)[0]).toEqual({ from: 9, kind: 'line' });
  });

  it('does not change the document', () => {
    const state = stateWith('one\ntwo\nthree', [alice]);
    expect(state.doc.toString()).toBe('one\ntwo\nthree');
  });

  it('clears when nobody is left', () => {
    const state = stateWith('one\ntwo\nthree', [alice]);
    const cleared = state.update({ effects: setPeerMarks.of({ marks: [], otherBranchNote: '' }) }).state;
    expect(decorationsOf(cleared)).toEqual([]);
  });

  it('skips a line the document no longer has', () => {
    expect(decorationsOf(stateWith('one', [alice]))).toEqual([]);
  });
});

describe('two people through the fake gateway', () => {
  it('shows both of them on their lines, and the document stays as it was', () => {
    const doc = 'one\ntwo\nthree\nfour';
    const name = 'github.com/o/r#a.md';
    const hub = createFakeHub();
    const me = hub.join('me');
    let table: PeerTable = new Map();
    me.subscribe((update) => {
      table = applyUpdate(table, update, 0);
    });
    hub.join('alice').send(name, { kind: 'markdown', branch: 'main', line: 2 }, 'room-1');
    hub.join('bob').send(name, { kind: 'markdown', branch: 'topic', line: 4 }, 'room-1');

    const peers = visiblePeers(table, { document: name, room: 'room-1', branch: 'main' }, 0);
    const state = stateWith(doc, lineMarks(peers, 4));

    expect(decorationsOf(state).filter((found) => found.kind === 'line').map((found) => found.from)).toEqual([4, 14]);
    expect(state.doc.toString()).toBe(doc);
  });
});
