import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gridModel, planEdit, withCellValue } from '../src/grid/model.js';

const SHEET = [
  '#! md-business:test-spec-tsv/v1',
  '# タイトル: ログイン検証',
  '#@ computed No. = rowNumber()',
  '#@ hidden rbbbbbbbbbbbb',
  'No.:number\t項目!\t手順:multiline\t結果:enum(OK|NG|未実施)\t_id',
  '7\tログイン\t開く\\n押す\t未実施\traaaaaaaaaaaa',
  '8\t旧文言\t\t未実施\trbbbbbbbbbbbb',
  '9\tログアウト\t\tOK\trcccccccccccc',
].join('\n');

describe('gridModel', () => {
  it('returns null for a TSV without the marker', () => {
    expect(gridModel('a\tb\n1\t2')).toBeNull();
  });

  it('describes the columns, leaving the row ID column out', () => {
    const model = gridModel(SHEET);
    expect(model?.title).toBe('ログイン検証');
    expect(model?.columns.map((c) => c.name)).toEqual(['No.', '項目', '手順', '結果']);
    expect(model?.columns[1]).toMatchObject({ required: true, locked: false });
    expect(model?.columns[2]?.type).toBe('multiline_text');
    expect(model?.columns[3]?.options).toEqual(['OK', 'NG', '未実施']);
  });

  it('skips hidden rows and keeps each row tied to its physical line', () => {
    const rows = gridModel(SHEET)?.rows ?? [];
    expect(rows.map((r) => r.line)).toEqual([5, 7]);
    expect(rows[0]?.cells).toEqual(['1', 'ログイン', '開く\n押す', '未実施']);
  });

  it('locks computed columns and shows their derived value', () => {
    const model = gridModel(SHEET);
    expect(model?.columns[0]?.locked).toBe(true);
    expect(model?.rows.map((r) => r.cells[0])).toEqual(['1', '2']);
  });

  it('pads short rows so every row has a cell per column', () => {
    const model = gridModel('#! md-business:test-spec-tsv/v1\na\tb\tc\n1');
    expect(model?.rows[0]?.cells).toEqual(['1', '', '']);
  });

  it('reads the shipped template', () => {
    const text = readFileSync(resolve(__dirname, '../../../templates/test-spec/standard-ja.tsv'), 'utf8');
    const model = gridModel(text);
    expect(model?.rows.length).toBeGreaterThan(0);
    expect(model?.columns.some((c) => c.name === '_id')).toBe(false);
  });
});

describe('withCellValue', () => {
  it('replaces one cell and escapes tabs and newlines', () => {
    expect(withCellValue('1\ta\tb', 2, 'x\ty\nz')).toBe('1\ta\tx\\ty\\nz');
  });

  it('leaves the other cells exactly as written', () => {
    expect(withCellValue('1\t開く\\n押す\t未実施\tr1', 2, 'OK')).toBe('1\t開く\\n押す\tOK\tr1');
  });

  it('extends a short row up to the edited column', () => {
    expect(withCellValue('1', 2, 'OK')).toBe('1\t\tOK');
  });
});

describe('gridModel row ids', () => {
  it('carries the row ID so an edit can be matched to its row', () => {
    expect(gridModel(SHEET)?.rows.map((r) => r.id)).toEqual(['raaaaaaaaaaaa', 'rcccccccccccc']);
  });
});

describe('planEdit', () => {
  const edit = { line: 5, column: 3, id: 'raaaaaaaaaaaa', before: '未実施', value: 'OK' };

  it('rewrites only the edited line', () => {
    expect(planEdit(SHEET, edit)).toEqual({
      line: 5,
      text: '7\tログイン\t開く\\n押す\tOK\traaaaaaaaaaaa',
    });
  });

  it('refuses when the row moved to another line', () => {
    expect(planEdit(SHEET, { ...edit, line: 7 })).toBeNull();
  });

  it('refuses when the cell changed since the grid showed it', () => {
    expect(planEdit(SHEET, { ...edit, before: 'NG' })).toBeNull();
  });

  it('refuses hidden rows, computed columns and the ID column', () => {
    expect(planEdit(SHEET, { ...edit, line: 6, id: 'rbbbbbbbbbbbb' })).toBeNull();
    expect(planEdit(SHEET, { ...edit, column: 0, before: '1', value: '5' })).toBeNull();
    expect(planEdit(SHEET, { ...edit, column: 4, before: 'raaaaaaaaaaaa' })).toBeNull();
  });

  it('matches by the shown value when the sheet has no ID column', () => {
    const text = '#! md-business:test-spec-tsv/v1\r\n項目\t結果\r\nA\t\r\n';
    expect(planEdit(text, { line: 2, column: 1, before: '', value: 'OK' })).toEqual({
      line: 2,
      text: 'A\tOK',
    });
  });
});
