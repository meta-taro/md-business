// @vitest-environment jsdom
//
// エディター全体のレイアウトは実機で確かめる（markdownEditor.ts 冒頭）。ここでは
// 選択の変化から居場所を知らせる部分だけを、jsdom 上の EditorView で確かめる。
import { describe, expect, it } from 'vitest';
import { createMarkdownEditor } from './markdownEditor';

function mount(doc: string) {
  const lines: number[] = [];
  const handle = createMarkdownEditor({
    parent: document.createElement('div'),
    doc,
    onChange: () => {},
    onCursor: (line) => lines.push(line),
  });
  return { handle, lines };
}

describe('createMarkdownEditor — onCursor', () => {
  it('カーソルが別の行へ移ったら、その行（1 始まり）を知らせる', () => {
    const { handle, lines } = mount('a\nbb\nccc');
    handle.view.dispatch({ selection: { anchor: 3 } });
    handle.view.dispatch({ selection: { anchor: 6 } });
    expect(lines).toEqual([2, 3]);
    handle.destroy();
  });

  it('同じ行の中で動いただけなら知らせない', () => {
    const { handle, lines } = mount('a\nbbbb');
    handle.view.dispatch({ selection: { anchor: 2 } });
    handle.view.dispatch({ selection: { anchor: 4 } });
    expect(lines).toEqual([2]);
    handle.destroy();
  });
});
