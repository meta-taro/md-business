import { describe, it, expect } from 'vitest';
import {
  appendTsvRow,
  deleteTsvRow,
  editTsvCell,
  readEditColumns,
  readTsvCell,
} from '../src/shared/tsvEdit.js';

const SHEET = [
  '#! md-business:test-spec-tsv/v1',
  '# タイトル: ログイン検証',
  '#@ rowid _id',
  '#@ hidden r000000000002',
  '#@ computed No. = rowNumber()',
  'No.:number\t手順:multiline\t結果:enum(OK|NG|保留|未実施)\t実施日:date\t_id',
  '1\t開く\tOK\t\tr000000000001',
  '\t控えの行\t保留\t\tr000000000002',
  '2\t押す\t未実施\t\tr000000000003',
  '',
].join('\n');

const lines = (text: string): string[] => text.split('\n');

describe('readEditColumns', () => {
  it('表に出る列だけを型つきで返し、計算列は塞ぐ', () => {
    const columns = readEditColumns(SHEET);
    expect(columns.map((c) => c.name)).toEqual(['No.', '手順', '結果', '実施日']);
    expect(columns[0]?.locked).toBe(true);
    expect(columns[1]).toMatchObject({ type: 'multiline_text', locked: false });
    expect(columns[2]).toMatchObject({ type: 'enum', choices: ['OK', 'NG', '保留', '未実施'] });
    expect(columns[3]).toMatchObject({ type: 'date' });
  });

  it('checkbox は TRUE / FALSE を選ばせる', () => {
    const [column] = readEditColumns('完了:checkbox\nTRUE');
    expect(column?.choices).toEqual(['TRUE', 'FALSE']);
  });
});

describe('editTsvCell', () => {
  it('表の行・列で指したセルだけを書き換え、他の行はそのまま残す', () => {
    const next = editTsvCell(SHEET, 1, 2, 'NG');
    expect(next).not.toBeNull();
    const before = lines(SHEET);
    const after = lines(next as string);
    expect(after[8]).toBe('2\t押す\tNG\t\tr000000000003');
    // 控えの行（表に出ない 2 行目のデータ）を数えずに 3 本目のデータ行を指す。
    expect(after.filter((_, i) => i !== 8)).toEqual(before.filter((_, i) => i !== 8));
  });

  it('改行・タブはセル内の印に畳む（1 レコード 1 物理行）', () => {
    const next = editTsvCell(SHEET, 0, 1, '開く\n押す\tする') as string;
    expect(lines(next)[6]).toBe('1\t開く\\n押す\\tする\tOK\t\tr000000000001');
  });

  it('CRLF と BOM を保つ', () => {
    const crlf = `﻿${SHEET.replace(/\n/g, '\r\n')}`;
    const next = editTsvCell(crlf, 0, 3, '2026-11-07') as string;
    expect(next.startsWith('﻿')).toBe(true);
    expect(next.split('\r\n')[6]).toBe('1\t開く\tOK\t2026-11-07\tr000000000001');
    expect(next.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('計算列・範囲外は書かない', () => {
    expect(editTsvCell(SHEET, 0, 0, '9')).toBeNull();
    expect(editTsvCell(SHEET, 0, 9, 'x')).toBeNull();
    expect(editTsvCell(SHEET, 5, 1, 'x')).toBeNull();
  });

  it('値が変わらなければ元のテキストを返す', () => {
    expect(editTsvCell(SHEET, 0, 2, 'OK')).toBe(SHEET);
  });

  it('末尾セルを省いた短い行は空で伸ばしてから書く', () => {
    const next = editTsvCell('項目\t結果\t担当\nA', 0, 2, '山') as string;
    expect(next).toBe('項目\t結果\t担当\nA\t\t山');
  });

  it('表の行数ちょうどを指すと、その値を持つ新しい行を足す', () => {
    const next = editTsvCell(SHEET, 2, 1, '待つ', () => 'r000000000009') as string;
    const after = lines(next);
    expect(after[9]).toBe('3\t待つ\t\t\tr000000000009');
    expect(after[10]).toBe('');
  });

  it('新しい行に空を書くのは何もしない（空の行はファイルに残らない）', () => {
    expect(editTsvCell(SHEET, 2, 1, '')).toBe(SHEET);
  });
});

describe('appendTsvRow', () => {
  it('ID 列があれば ID だけ持つ行を足し、計算列も埋める', () => {
    const next = appendTsvRow(SHEET, () => 'r000000000009') as string;
    expect(lines(next)[9]).toBe('3\t\t\t\tr000000000009');
  });

  it('データ行が無ければヘッダの直後に足す', () => {
    const next = appendTsvRow('#@ rowid _id\n項目\t_id\n# 末尾のメモ', () => 'r000000000009');
    expect(next).toBe('#@ rowid _id\n項目\t_id\n\tr000000000009\n# 末尾のメモ');
  });
});

describe('deleteTsvRow', () => {
  it('表の行を消し、通し番号を詰め直す。控えの行は残す', () => {
    const next = deleteTsvRow(SHEET, 0) as string;
    const after = lines(next);
    expect(after).toHaveLength(lines(SHEET).length - 1);
    expect(after[6]).toBe('\t控えの行\t保留\t\tr000000000002');
    expect(after[7]).toBe('1\t押す\t未実施\t\tr000000000003');
  });

  it('範囲外は消さない', () => {
    expect(deleteTsvRow(SHEET, 2)).toBeNull();
  });
});

describe('appendTsvRow（空になる行）', () => {
  it('ID 列も計算列も無いと空の行になるので足さない', () => {
    expect(appendTsvRow('項目\t結果\nA\tOK')).toBeNull();
  });
});

describe('readTsvCell', () => {
  it('表の行・列で指したセルを、印を戻した値で返す', () => {
    const sheet = editTsvCell(SHEET, 0, 1, '開く\n押す') as string;
    expect(readTsvCell(sheet, 0, 1)).toBe('開く\n押す');
    // 控えの行を数えない
    expect(readTsvCell(SHEET, 1, 2)).toBe('未実施');
  });

  it('省かれた末尾セルは空、範囲外は null', () => {
    expect(readTsvCell('項目\t結果\nA', 0, 1)).toBe('');
    expect(readTsvCell(SHEET, 2, 1)).toBeNull();
    expect(readTsvCell(SHEET, 0, 9)).toBeNull();
  });
});
