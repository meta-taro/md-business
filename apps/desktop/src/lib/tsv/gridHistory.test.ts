import { describe, it, expect } from 'vitest';
import {
  initHistory,
  pushHistory,
  undo,
  redo,
  canUndo,
  canRedo,
} from './gridHistory';

describe('gridHistory', () => {
  it('初期状態は present のみ・undo も redo もできない', () => {
    const h = initHistory('a');
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('push で present が進み、直前が past に積まれる', () => {
    const h = pushHistory(initHistory('a'), 'b');
    expect(h.present).toBe('b');
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
  });

  it('undo で 1 つ前へ戻り、戻した分は redo できる', () => {
    const h = undo(pushHistory(initHistory('a'), 'b'));
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);
  });

  it('redo で undo を取り消して present を進める', () => {
    const h = redo(undo(pushHistory(initHistory('a'), 'b')));
    expect(h.present).toBe('b');
    expect(canRedo(h)).toBe(false);
    expect(canUndo(h)).toBe(true);
  });

  it('undo できない状態で undo しても不変', () => {
    const h = initHistory('a');
    expect(undo(h)).toEqual(h);
  });

  it('redo できない状態で redo しても不変', () => {
    const h = pushHistory(initHistory('a'), 'b');
    expect(redo(h)).toEqual(h);
  });

  it('undo 後に新しい push をすると future（redo 候補）は破棄される', () => {
    const h0 = pushHistory(pushHistory(initHistory('a'), 'b'), 'c'); // a→b→c
    const h1 = undo(h0); // present=b, future=[c]
    const h2 = pushHistory(h1, 'd'); // present=d, future 破棄
    expect(h2.present).toBe('d');
    expect(canRedo(h2)).toBe(false);
    // b→d の分岐なので、undo で b に戻れる
    expect(undo(h2).present).toBe('b');
  });

  it('同一値の push は履歴を汚さない（no-op）', () => {
    const h = pushHistory(initHistory('a'), 'a');
    expect(canUndo(h)).toBe(false);
    expect(h.present).toBe('a');
  });

  it('cap を超えた past は古い方から捨てる（present は保持）', () => {
    let h = initHistory('0');
    for (let i = 1; i <= 5; i++) h = pushHistory(h, String(i), 3);
    // cap=3 なので past は最大 3 件。present=5、past=[2,3,4]
    expect(h.present).toBe('5');
    expect(h.past).toEqual(['2', '3', '4']);
    // 3 回 undo すると past の先頭 '2' まで戻れる
    h = undo(undo(undo(h)));
    expect(h.present).toBe('2');
    expect(canUndo(h)).toBe(false);
  });
});
