/**
 * 相手の居場所を CodeMirror の行に描く装飾フィールド。
 *
 * 行の左端に相手の色の帯を引き、行の終わりに名前を並べる。文書には一切触れない
 * （装飾だけ）。届くたびに貼り直し、その間に打たれた文字には位置を写して追従する。
 *
 * 名前は相手から届いた文字なので、DOM へは textContent でだけ入れる。
 */
import { EditorView, Decoration, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, type Text } from '@codemirror/state';
import type { LineMark, LineMarkPeer } from '$lib/presence/lineMarks';

export interface PeerMarksPayload {
  marks: readonly LineMark[];
  /** 別のブランチを見ている人の名前に添える説明（表示言語に合わせて呼び出し側が渡す）。 */
  otherBranchNote: string;
}

export const setPeerMarks = StateEffect.define<PeerMarksPayload>();

class PeerNamesWidget extends WidgetType {
  constructor(
    private readonly peers: readonly LineMarkPeer[],
    private readonly otherBranchNote: string,
  ) {
    super();
  }

  eq(other: PeerNamesWidget): boolean {
    return (
      other.otherBranchNote === this.otherBranchNote &&
      JSON.stringify(other.peers) === JSON.stringify(this.peers)
    );
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-peer-names';
    wrap.setAttribute('aria-hidden', 'true');
    for (const peer of this.peers) {
      const name = document.createElement('span');
      name.className = 'cm-peer-name';
      if (peer.faded) name.classList.add('cm-peer-faded');
      if (peer.otherBranch) name.classList.add('cm-peer-other-branch');
      name.style.setProperty('--peer-hue', String(peer.hue));
      name.textContent = peer.label;
      name.title = peer.otherBranch ? `${peer.who}（${this.otherBranchNote}）` : peer.who;
      wrap.append(name);
    }
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(doc: Text, payload: PeerMarksPayload): DecorationSet {
  const ranges = [];
  for (const mark of payload.marks) {
    if (mark.line < 1 || mark.line > doc.lines || mark.peers.length === 0) continue;
    const line = doc.line(mark.line);
    // 帯は先頭の人の色。同じ行に何人いても、名前の方で全員が分かる。
    const first = mark.peers[0];
    ranges.push(
      Decoration.line({
        class: first?.faded ? 'cm-peer-line cm-peer-faded' : 'cm-peer-line',
        attributes: { style: `--peer-hue: ${first?.hue ?? 0}` },
      }).range(line.from),
      Decoration.widget({ widget: new PeerNamesWidget(mark.peers, payload.otherBranchNote), side: 1 }).range(
        line.to,
      ),
    );
  }
  return Decoration.set(ranges, true);
}

/** 相手の居場所の装飾フィールド。markdownEditor の拡張に含める。 */
export const peerMarksField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setPeerMarks)) next = buildDecorations(tr.state.doc, effect.value);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});
