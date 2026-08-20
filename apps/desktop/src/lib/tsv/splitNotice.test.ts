import { describe, expect, it } from 'vitest';
import { splitRows, showsSplitNotice, nextSplitRow } from './splitNotice';

function issue(row: number, code: string): { row: number; code: string } {
  return { row, code };
}

describe('splitRows', () => {
  it('割れた疑いの行だけを昇順で返す', () => {
    expect(splitRows([issue(4, 'short_row'), issue(1, 'type'), issue(0, 'short_row')])).toEqual([
      0, 4,
    ]);
  });

  it('同じ行が二重に来ても 1 つに畳む', () => {
    expect(splitRows([issue(2, 'short_row'), issue(2, 'short_row')])).toEqual([2]);
  });

  it('何も無ければ空', () => {
    expect(splitRows([issue(0, 'type'), issue(3, 'required')])).toEqual([]);
  });
});

describe('showsSplitNotice', () => {
  it('割れた行があれば出す', () => {
    expect(showsSplitNotice([0], 'sheets/A.tsv', null)).toBe(true);
  });

  it('無ければ出さない', () => {
    expect(showsSplitNotice([], 'sheets/A.tsv', null)).toBe(false);
  });

  it('閉じたシートでは出さない', () => {
    expect(showsSplitNotice([0], 'sheets/A.tsv', 'sheets/A.tsv')).toBe(false);
  });

  it('別のシートを開いたら出し直す', () => {
    expect(showsSplitNotice([0], 'sheets/B.tsv', 'sheets/A.tsv')).toBe(true);
  });

  it('名前の無いシートでも閉じられる（空文字で閉じた印）', () => {
    expect(showsSplitNotice([0], null, '')).toBe(false);
  });

  it('名前の無いシートは開いた直後なら出す', () => {
    expect(showsSplitNotice([0], null, 'sheets/A.tsv')).toBe(true);
  });
});

describe('nextSplitRow', () => {
  it('いまの行より後の最初へ送る', () => {
    expect(nextSplitRow([0, 4, 9], 4)).toBe(9);
  });

  it('最後まで行ったら先頭へ戻る', () => {
    expect(nextSplitRow([0, 4, 9], 9)).toBe(0);
  });

  it('間の行からでも次へ送る', () => {
    expect(nextSplitRow([0, 4, 9], 5)).toBe(9);
  });

  it('何も無ければ送り先が無い', () => {
    expect(nextSplitRow([], 0)).toBeNull();
  });
});
