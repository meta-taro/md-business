import { describe, it, expect } from 'vitest';
import {
  initHistory,
  pushHistory,
  undo,
  redo,
  canUndo,
  canRedo,
  historyChars,
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
    for (let i = 1; i <= 5; i++) h = pushHistory(h, String(i), { cap: 3 });
    // cap=3 なので past は最大 3 件。present=5、past=[2,3,4]
    expect(h.present).toBe('5');
    expect(h.past).toEqual(['2', '3', '4']);
    // 3 回 undo すると past の先頭 '2' まで戻れる
    h = undo(undo(undo(h)));
    expect(h.present).toBe('2');
    expect(canUndo(h)).toBe(false);
  });
});

describe('historyChars', () => {
  it('現在値だけの履歴は present の長さ', () => {
    expect(historyChars(initHistory('abc'))).toBe(3);
  });

  it('past・future も合わせて数える', () => {
    const h = undo(pushHistory(pushHistory(initHistory('a'), 'bb'), 'ccc'));
    // past='a' / present='bb' / future='ccc'
    expect(historyChars(h)).toBe(6);
  });
});

describe('gridHistory の連結（同一セルの打鍵をまとめる）', () => {
  it('同じ key の連続 push は past を増やさず present だけ差し替える', () => {
    let h = initHistory('');
    h = pushHistory(h, 'あ', { key: '0:1' });
    h = pushHistory(h, 'あい', { key: '0:1' });
    h = pushHistory(h, 'あいう', { key: '0:1' });
    expect(h.present).toBe('あいう');
    // 1 セル分の打鍵は 1 手。undo 1 回で打つ前へ戻る。
    expect(h.past).toEqual(['']);
    expect(undo(h).present).toBe('');
  });

  it('key が変われば別の手として積む', () => {
    let h = initHistory('');
    h = pushHistory(h, 'a', { key: '0:1' });
    h = pushHistory(h, 'ab', { key: '0:2' });
    expect(h.past).toEqual(['', 'a']);
    expect(undo(h).present).toBe('a');
  });

  it('key なしの push（貼り付け・行操作など）は常に別の手', () => {
    let h = initHistory('');
    h = pushHistory(h, 'a', { key: '0:1' });
    h = pushHistory(h, 'ab');
    h = pushHistory(h, 'abc');
    expect(h.past).toEqual(['', 'a', 'ab']);
  });

  it('key なしの直後に同じ key で打っても、その手には結合しない', () => {
    let h = initHistory('');
    h = pushHistory(h, 'a');
    h = pushHistory(h, 'ab', { key: '0:1' });
    expect(h.past).toEqual(['', 'a']);
  });

  it('undo / redo をまたぐと連結は切れる', () => {
    let h = initHistory('');
    h = pushHistory(h, 'a', { key: '0:1' });
    h = undo(h);
    h = redo(h); // present='a' に戻ってきた
    h = pushHistory(h, 'ab', { key: '0:1' });
    // 戻ってきた 'a' は確定した手。連結して消してはいけない。
    expect(h.past).toEqual(['', 'a']);
    expect(undo(h).present).toBe('a');
  });

  it('連結中でも cap を超えた past は古い方から捨てる', () => {
    let h = initHistory('0');
    for (let i = 1; i <= 5; i++) h = pushHistory(h, String(i), { cap: 3, key: String(i) });
    expect(h.past).toEqual(['2', '3', '4']);
  });
});
