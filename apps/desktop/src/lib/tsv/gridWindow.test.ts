import { describe, it, expect } from 'vitest';
import { rowWindow, rowOffset, scrollToRow, OVERSCAN_ROWS } from './gridWindow';

/** 既定高で揃った高さの並び。 */
function flat(count: number, height = 30): number[] {
  return Array.from({ length: count }, () => height);
}

describe('rowOffset', () => {
  it('先頭行は 0', () => {
    expect(rowOffset(flat(10), 30, 0)).toBe(0);
  });

  it('手前の行の高さを足したもの', () => {
    expect(rowOffset([100, 20, 30], 30, 2)).toBe(120);
  });

  it('高さの並びに無い行は既定高で数える', () => {
    // 実データ行のうしろに続く空行は高さを持たない。
    expect(rowOffset([100], 30, 3)).toBe(160);
  });

  it('負の行は 0', () => {
    expect(rowOffset(flat(10), 30, -1)).toBe(0);
  });
});

describe('rowWindow', () => {
  it('行が無ければ空', () => {
    const w = rowWindow({ heights: [], total: 0, defaultHeight: 30, scrollTop: 0, viewportHeight: 300 });
    expect(w).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0 });
  });

  it('先頭では見えている行だけを描く', () => {
    const w = rowWindow({
      heights: flat(100),
      total: 100,
      defaultHeight: 30,
      scrollTop: 0,
      viewportHeight: 90,
      overscan: 0,
    });
    expect(w).toEqual({ start: 0, end: 3, topPad: 0, bottomPad: 97 * 30 });
  });

  it('スクロール位置に合わせて窓がずれる', () => {
    const w = rowWindow({
      heights: flat(100),
      total: 100,
      defaultHeight: 30,
      scrollTop: 300,
      viewportHeight: 90,
      overscan: 0,
    });
    expect(w).toEqual({ start: 10, end: 13, topPad: 300, bottomPad: 87 * 30 });
  });

  it('前後に余分を持つ', () => {
    // 余分が無いと、スクロールのたびに端の行が空白として一瞬見える。
    const w = rowWindow({
      heights: flat(100),
      total: 100,
      defaultHeight: 30,
      scrollTop: 300,
      viewportHeight: 90,
      overscan: 2,
    });
    expect(w.start).toBe(8);
    expect(w.end).toBe(15);
    expect(w.topPad).toBe(240);
  });

  it('端では余分がはみ出さない', () => {
    const top = rowWindow({
      heights: flat(20),
      total: 20,
      defaultHeight: 30,
      scrollTop: 0,
      viewportHeight: 90,
      overscan: 5,
    });
    expect(top.start).toBe(0);
    expect(top.topPad).toBe(0);

    const bottom = rowWindow({
      heights: flat(20),
      total: 20,
      defaultHeight: 30,
      scrollTop: 510,
      viewportHeight: 90,
      overscan: 5,
    });
    expect(bottom.end).toBe(20);
    expect(bottom.bottomPad).toBe(0);
  });

  it('高さがまちまちでも位置が合う', () => {
    const w = rowWindow({
      heights: [100, 20, 20, 20, 20],
      total: 5,
      defaultHeight: 30,
      scrollTop: 100,
      viewportHeight: 40,
      overscan: 0,
    });
    expect(w.start).toBe(1);
    expect(w.topPad).toBe(100);
    expect(w.end).toBe(3);
  });

  it('高さの並びに無い行は既定高で数える', () => {
    const w = rowWindow({
      heights: [],
      total: 10,
      defaultHeight: 30,
      scrollTop: 0,
      viewportHeight: 60,
      overscan: 0,
    });
    expect(w.end).toBe(2);
    expect(w.bottomPad).toBe(8 * 30);
  });

  it('詰め物と描く行を足すと表全体の高さになる', () => {
    // ここがずれるとスクロールバーの長さが変わり、掴んだ位置が飛ぶ。
    const heights = [40, 30, 55, 30, 30, 80, 30, 30, 30, 30];
    for (const scrollTop of [0, 45, 130, 300, 1000]) {
      const w = rowWindow({ heights, total: 10, defaultHeight: 30, scrollTop, viewportHeight: 120 });
      const drawn = heights.slice(w.start, w.end).reduce((a, b) => a + b, 0);
      expect(w.topPad + drawn + w.bottomPad).toBe(385);
    }
  });

  it('表示領域が測れていなくても壊れない', () => {
    const w = rowWindow({
      heights: flat(10),
      total: 10,
      defaultHeight: 30,
      scrollTop: 0,
      viewportHeight: 0,
      overscan: 0,
    });
    expect(w).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 300 });
  });

  it('行数より下へスクロールしていても窓は表の中に収まる', () => {
    const w = rowWindow({
      heights: flat(10),
      total: 10,
      defaultHeight: 30,
      scrollTop: 99_999,
      viewportHeight: 90,
    });
    expect(w.end).toBe(10);
    expect(w.start).toBeLessThanOrEqual(w.end);
    expect(w.bottomPad).toBe(0);
  });

  it('既定の余分は 0 より大きい', () => {
    expect(OVERSCAN_ROWS).toBeGreaterThan(0);
  });
});

describe('scrollToRow', () => {
  const base = { heights: flat(100), defaultHeight: 30, viewportHeight: 300 };

  it('すでに見えているなら動かさない', () => {
    expect(scrollToRow({ ...base, row: 5, scrollTop: 100 })).toBe(100);
  });

  it('上に外れていれば行の上端まで戻す', () => {
    expect(scrollToRow({ ...base, row: 1, scrollTop: 300 })).toBe(30);
  });

  it('下に外れていれば行の下端が見えるところまで送る', () => {
    // 20 行目の下端は 630px。表示領域 300px なので 330px まで送る。
    expect(scrollToRow({ ...base, row: 20, scrollTop: 0 })).toBe(330);
  });

  it('表示領域より高い行は上端に合わせる', () => {
    expect(
      scrollToRow({ heights: [500, 30], defaultHeight: 30, viewportHeight: 300, row: 0, scrollTop: 400 }),
    ).toBe(0);
  });

  it('下余白を求めると、見えていても余白のぶんだけ送る', () => {
    // 9 行目は 270〜300px で表示領域にちょうど収まっているが、下に余白が無い。
    // 120px の余白を求めると、下端 300px + 120px が見えるところまで送る。
    expect(scrollToRow({ ...base, row: 9, scrollTop: 0, bottomGap: 120 })).toBe(120);
  });

  it('下余白が足りていれば動かさない', () => {
    expect(scrollToRow({ ...base, row: 5, scrollTop: 0, bottomGap: 120 })).toBe(0);
  });

  it('行と下余白の合計が表示領域を超えるときは行の上端に合わせる', () => {
    // 上端を切ってまで余白を作らない（セルが見えなくなっては本末転倒）。
    expect(
      scrollToRow({
        heights: [30, 250],
        defaultHeight: 30,
        viewportHeight: 300,
        row: 1,
        scrollTop: 0,
        bottomGap: 120,
      }),
    ).toBe(30);
  });
});
