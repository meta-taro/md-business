import { describe, expect, it } from 'vitest';
import { findPage, sheetLabel, sheetScale } from './bookSheets';

describe('sheetScale', () => {
  it('高さに収まるなら、ページの幅に合わせる（組み幅より広ければ広げる）', () => {
    expect(sheetScale(640, 640, 500, 800)).toBe(1);
    expect(sheetScale(640, 960, 500, 800)).toBe(1.5);
    expect(sheetScale(640, 320, 500, 800)).toBe(0.5);
  });

  it('高さがはみ出すページは、その分だけさらに縮める', () => {
    expect(sheetScale(640, 640, 1600, 800)).toBe(0.5);
    expect(sheetScale(640, 1280, 1000, 800)).toBe(0.8);
  });

  it('寸法が取れないときは縮めない', () => {
    expect(sheetScale(640, 900, 0, 800)).toBe(1);
    expect(sheetScale(640, 900, 500, 0)).toBe(1);
    expect(sheetScale(640, 0, 500, 800)).toBe(1);
  });
});

describe('findPage', () => {
  const labels = ['表紙', 'p.1', 'p.2', 'p.19', 'p.20'];

  it('印の文字そのままで引ける', () => {
    expect(findPage('p.19', labels, labels.length)).toBe(3);
    expect(findPage('表紙', labels, labels.length)).toBe(0);
  });

  it('数だけ・「p」の書き方の揺れ・全角でも引ける', () => {
    expect(findPage('19', labels, labels.length)).toBe(3);
    expect(findPage('P19', labels, labels.length)).toBe(3);
    expect(findPage(' p. 20 ', labels, labels.length)).toBe(4);
    expect(findPage('１９', labels, labels.length)).toBe(3);
  });

  it('印のある本では、無い番号を通し番号と取り違えない', () => {
    // 「3」は 4 枚目ではない。原本に p.3 が無いなら、無いと返す。
    expect(findPage('3', labels, labels.length)).toBeNull();
    expect(findPage('', labels, labels.length)).toBeNull();
  });

  it('印の無い文書では通し番号で引く', () => {
    expect(findPage('3', [], 10)).toBe(2);
    expect(findPage('p.3', [], 10)).toBe(2);
    expect(findPage('11', [], 10)).toBeNull();
    expect(findPage('0', [], 10)).toBeNull();
  });
});

describe('sheetLabel', () => {
  const labels = ['表紙', 'p.1', 'p.2'];

  it('原本の番号と通し番号を並べる', () => {
    expect(sheetLabel(1, 1, labels)).toBe('p.1 · 2 / 3');
  });

  it('見開きでは左右の番号を出し、右が無ければ 1 つだけ', () => {
    expect(sheetLabel(0, 2, labels)).toBe('表紙–p.1 · 1–2 / 3');
    expect(sheetLabel(2, 2, labels)).toBe('p.2 · 3 / 3');
  });

  it('印の前に置かれた冒頭（空の印）は通し番号だけ', () => {
    expect(sheetLabel(0, 1, ['', 'p.1'])).toBe('1 / 2');
  });
});
