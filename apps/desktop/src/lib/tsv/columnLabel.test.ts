import { describe, it, expect } from 'vitest';
import { columnLabel, columnLabels } from './columnLabel';

/**
 * 検証グリッドのスプレッドシート列レター
 * （ヘッダーの列座標を ABC…AA,AB… 表示にする）。
 * 型付きヘッダとは別に、A,B,C…Z,AA,AB… の列座標をバーで示すための純関数。
 * 表現は Excel / Sheets と同じ二分法 base-26（A=0,… Z=25, AA=26,…）。
 */

describe('columnLabel', () => {
  it('先頭 26 列は A〜Z', () => {
    expect(columnLabel(0)).toBe('A');
    expect(columnLabel(1)).toBe('B');
    expect(columnLabel(25)).toBe('Z');
  });

  it('26 列目からは 2 文字（AA, AB…AZ, BA）', () => {
    expect(columnLabel(26)).toBe('AA');
    expect(columnLabel(27)).toBe('AB');
    expect(columnLabel(51)).toBe('AZ');
    expect(columnLabel(52)).toBe('BA');
  });

  it('境界（ZZ→AAA）まで二分法 base-26 で連続', () => {
    expect(columnLabel(701)).toBe('ZZ');
    expect(columnLabel(702)).toBe('AAA');
  });

  it('負のインデックスは空文字（座標を持たない列）', () => {
    expect(columnLabel(-1)).toBe('');
  });
});

describe('columnLabels', () => {
  it('列数ぶんの座標レターを 0 始まりで並べる', () => {
    expect(columnLabels(3)).toEqual(['A', 'B', 'C']);
  });

  it('0 列なら空配列', () => {
    expect(columnLabels(0)).toEqual([]);
  });

  it('26 をまたいでも連続する', () => {
    expect(columnLabels(28)).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      'AA', 'AB',
    ]);
  });
});
