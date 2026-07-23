import { describe, it, expect } from 'vitest';
import { diffLines } from './diff.js';

/**
 * update_document が返す差分プレビュー用の行 diff（純ロジック）。
 * LCS ベースで「変わっていない行は context、追加は add、削除は del」を返す。
 * MCP 応答へそのまま載せるので順序も保つ。
 */
describe('diffLines', () => {
  it('同一文字列は全行 context・add/del なし', () => {
    const d = diffLines('a\nb\nc', 'a\nb\nc');
    expect(d.every((l) => l.type === 'context')).toBe(true);
    expect(d.map((l) => l.text)).toEqual(['a', 'b', 'c']);
  });

  it('1 行の変更を del + add で表す', () => {
    const d = diffLines('a\nb\nc', 'a\nB\nc');
    expect(d).toEqual([
      { type: 'context', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'B' },
      { type: 'context', text: 'c' },
    ]);
  });

  it('末尾への追加行は add のみ', () => {
    const d = diffLines('a\nb', 'a\nb\nc');
    expect(d.filter((l) => l.type === 'add')).toEqual([{ type: 'add', text: 'c' }]);
    expect(d.filter((l) => l.type === 'del')).toEqual([]);
  });

  it('行の削除は del のみ', () => {
    const d = diffLines('a\nb\nc', 'a\nc');
    expect(d.filter((l) => l.type === 'del')).toEqual([{ type: 'del', text: 'b' }]);
    expect(d.filter((l) => l.type === 'add')).toEqual([]);
  });

  it('末尾行の削除は del のみ（del 末尾ループを通る）', () => {
    const d = diffLines('a\nb\nc', 'a');
    expect(d).toEqual([
      { type: 'context', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'del', text: 'c' },
    ]);
  });

  it('順序は保たれる（del が add より前）', () => {
    const d = diffLines('x\ny', 'x\nz');
    const delIdx = d.findIndex((l) => l.type === 'del');
    const addIdx = d.findIndex((l) => l.type === 'add');
    expect(delIdx).toBeLessThan(addIdx);
  });

  it('全置換（共通行なし）は全 del のあと全 add', () => {
    const d = diffLines('a\nb', 'c\nd');
    expect(d).toEqual([
      { type: 'del', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'c' },
      { type: 'add', text: 'd' },
    ]);
  });
});
