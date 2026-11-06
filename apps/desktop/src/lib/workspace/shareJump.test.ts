import { describe, expect, it } from 'vitest';
import { resolveShareJump } from './shareJump';

const SHEET = [
  '#! md-business:test-spec-tsv/v1',
  '# タイトル: 例',
  '#@ rowid _id',
  'No.:number!\t項目!\t_id',
  '1\t一つ目\tr000000000001',
  '',
  '2\t二つ目\tr000000000002',
].join('\n');

describe('resolveShareJump（検証シート）', () => {
  it('行 ID があれば、その行へ移る', () => {
    expect(resolveShareJump(SHEET, true, { id: 'r000000000002' })).toEqual({
      kind: 'row',
      column: '_id',
      value: 'r000000000002',
    });
  });

  it('行 ID と行番号の両方があれば、行 ID を使う', () => {
    expect(resolveShareJump(SHEET, true, { id: 'r000000000002', line: 5 })).toEqual({
      kind: 'row',
      column: '_id',
      value: 'r000000000002',
    });
  });

  it('行番号だけなら、その物理行にある行の ID で移る（空行を挟んでもずれない）', () => {
    expect(resolveShareJump(SHEET, true, { line: 5 })).toEqual({
      kind: 'row',
      column: '_id',
      value: 'r000000000001',
    });
    expect(resolveShareJump(SHEET, true, { line: 7 })).toEqual({
      kind: 'row',
      column: '_id',
      value: 'r000000000002',
    });
  });

  it('行番号がデータ行を指していなければ、見つからなかったと返す', () => {
    for (const line of [1, 4, 6, 99]) {
      expect(resolveShareJump(SHEET, true, { line }), String(line)).toEqual({ kind: 'missing', line });
    }
  });

  it('ID 列の無いシートでは、行番号から行を決められない', () => {
    const plain = ['#! md-business:test-spec-tsv/v1', 'No.\t項目', '1\ta'].join('\n');
    expect(resolveShareJump(plain, true, { line: 3 })).toEqual({ kind: 'missing', line: 3 });
  });

  it('宣言した名前の ID 列を使う', () => {
    const named = ['#! md-business:test-spec-tsv/v1', '#@ rowid key', 'No.\tkey', '1\tr00000000000a'].join('\n');
    expect(resolveShareJump(named, true, { line: 4 })).toEqual({
      kind: 'row',
      column: 'key',
      value: 'r00000000000a',
    });
  });

  it('どちらも無ければ移らない', () => {
    expect(resolveShareJump(SHEET, true, {})).toBeNull();
  });
});

describe('resolveShareJump（Markdown など）', () => {
  const MD = '# 見出し\r\n\r\n本文\r\n最後';

  it('行番号の行頭へカーソルを置く', () => {
    expect(resolveShareJump(MD, false, { line: 1 })).toEqual({ kind: 'caret', offset: 0 });
    expect(resolveShareJump(MD, false, { line: 3 })).toEqual({ kind: 'caret', offset: 9 });
    expect(resolveShareJump(MD, false, { line: 4 })).toEqual({ kind: 'caret', offset: 13 });
  });

  it('行数を超えていれば、見つからなかったと返す', () => {
    expect(resolveShareJump(MD, false, { line: 5 })).toEqual({ kind: 'missing', line: 5 });
  });

  it('行 ID は検証シートでしか意味を持たないので使わない', () => {
    expect(resolveShareJump(MD, false, { id: 'r000000000001' })).toBeNull();
    expect(resolveShareJump(MD, false, { id: 'r000000000001', line: 3 })).toEqual({ kind: 'caret', offset: 9 });
  });
});
