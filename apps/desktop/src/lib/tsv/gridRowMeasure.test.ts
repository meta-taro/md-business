import { describe, it, expect } from 'vitest';
import { effectiveRowHeights, mergeMeasuredHeights } from './gridRowMeasure';

describe('mergeMeasuredHeights', () => {
  it('測った高さを控える', () => {
    expect(mergeMeasuredHeights([], [{ row: 2, height: 96 }])).toEqual([
      undefined,
      undefined,
      96,
    ]);
  });

  it('変わらなければ元の並びをそのまま返す', () => {
    // 同じ配列を返すことで、測り直しのたびに描き直しが走るのを止める。
    const current = mergeMeasuredHeights([], [{ row: 0, height: 30 }]);
    expect(mergeMeasuredHeights(current, [{ row: 0, height: 30 }])).toBe(current);
  });

  it('ごく僅かな差は動きとみなさない', () => {
    const current = mergeMeasuredHeights([], [{ row: 0, height: 30 }]);
    expect(mergeMeasuredHeights(current, [{ row: 0, height: 30.2 }])).toBe(current);
  });

  it('はっきり変わった行だけ書き換える', () => {
    const current = mergeMeasuredHeights([], [
      { row: 0, height: 30 },
      { row: 1, height: 30 },
    ]);
    const next = mergeMeasuredHeights(current, [{ row: 1, height: 120 }]);
    expect(next).not.toBe(current);
    expect(next).toEqual([30, 120]);
  });

  it('測れなかった値は控えない', () => {
    const current = mergeMeasuredHeights([], [{ row: 0, height: 30 }]);
    expect(mergeMeasuredHeights(current, [{ row: 1, height: 0 }])).toBe(current);
    expect(mergeMeasuredHeights(current, [{ row: 1, height: Number.NaN }])).toBe(current);
    expect(mergeMeasuredHeights(current, [{ row: -1, height: 40 }])).toBe(current);
  });
});

describe('effectiveRowHeights', () => {
  it('実測が無ければ宣言高、宣言も無ければ既定高', () => {
    expect(effectiveRowHeights([50], [], 3, 30)).toEqual([50, 30, 30]);
  });

  it('実測がある行は実測を使う', () => {
    // 折り返しで内容が伸びた行は、宣言した高さより実際は高い。
    expect(effectiveRowHeights([30, 30], [30, 150], 2, 30)).toEqual([30, 150]);
  });

  it('宣言高を下回る実測は宣言高まで戻す', () => {
    // tr の height は最小高なので、実際の高さが宣言を下回ることはない（控えが古いだけ）。
    expect(effectiveRowHeights([80], [40], 1, 30)).toEqual([80]);
  });

  it('行数ぶんだけ返す', () => {
    expect(effectiveRowHeights([30, 30, 30], [200, 200, 200], 2, 30)).toHaveLength(2);
  });
});
