import { describe, expect, it } from 'vitest';
import type { TestSpec } from '@md-business/schema-test-spec';

import {
  planSheetWriteOps,
  applySheetValuesToSpec,
  validateSheetValues,
  resolveSheetName,
  type SheetWriteOps,
  type SheetValidationIssue,
} from '../src/lib/testSpecSheetOps.js';

function sampleSpec(overrides: Partial<TestSpec> = {}): TestSpec {
  return {
    schema: 'test-spec/v1',
    documentNumber: 'TEST-2026-0001',
    title: 'ログイン機能 検証シート',
    version: '0.1.0',
    issueDate: '2026-06-18',
    status: 'executing',
    authors: [{ name: '田中 雅友', role: 'PdM' }],
    columns: [
      { name: '項目', type: 'text' },
      { name: '手順', type: 'multiline_text' },
      {
        name: '結果',
        type: 'enum',
        values: ['OK', 'NG', '保留', '未実施'],
        visual: {
          NG: { row_background: '#fce8e6' },
          保留: { background: '#fef7e0' },
          OK: { color: '#1e7e34' },
        },
      },
      { name: '実施日', type: 'date' },
      { name: '回数', type: 'number', min: 1, max: 10 },
      { name: '完了', type: 'checkbox' },
      { name: '参考リンク', type: 'url' },
    ],
    ...overrides,
  };
}

describe('planSheetWriteOps', () => {
  it('emits header values matching column names in order', () => {
    const ops = planSheetWriteOps(sampleSpec());
    expect(ops.headerValues).toEqual([
      '項目',
      '手順',
      '結果',
      '実施日',
      '回数',
      '完了',
      '参考リンク',
    ]);
  });

  it('always freezes the header row', () => {
    expect(planSheetWriteOps(sampleSpec()).frozenRows).toBe(1);
  });

  it('exposes spec.title as sheetName for downstream sheet.setName() calls', () => {
    const ops = planSheetWriteOps(sampleSpec());
    expect(ops.sheetName).toBe('ログイン機能 検証シート');
  });

  it('sheetName reflects spec.title even when title contains spaces and JP/EN mix', () => {
    const ops = planSheetWriteOps(
      sampleSpec({ title: '受発注ワークフロー 検証シート' }),
    );
    expect(ops.sheetName).toBe('受発注ワークフロー 検証シート');
  });

  it('emits list DataValidation for enum columns with values', () => {
    const ops = planSheetWriteOps(sampleSpec());
    const enumOp = ops.dataValidations.find((v) => v.kind === 'list');
    expect(enumOp).toBeDefined();
    expect(enumOp?.columnIndex).toBe(2);
    expect(enumOp?.values).toEqual(['OK', 'NG', '保留', '未実施']);
  });

  it('emits date DataValidation for date columns', () => {
    const ops = planSheetWriteOps(sampleSpec());
    const dateOp = ops.dataValidations.find((v) => v.kind === 'date');
    expect(dateOp).toBeDefined();
    expect(dateOp?.columnIndex).toBe(3);
  });

  it('emits number DataValidation with min/max bounds', () => {
    const ops = planSheetWriteOps(sampleSpec());
    const numOp = ops.dataValidations.find((v) => v.kind === 'number');
    expect(numOp).toBeDefined();
    expect(numOp?.columnIndex).toBe(4);
    expect(numOp?.min).toBe(1);
    expect(numOp?.max).toBe(10);
  });

  it('emits checkbox DataValidation for checkbox columns', () => {
    const ops = planSheetWriteOps(sampleSpec());
    const cbOp = ops.dataValidations.find((v) => v.kind === 'checkbox');
    expect(cbOp).toBeDefined();
    expect(cbOp?.columnIndex).toBe(5);
  });

  it('emits url DataValidation for url columns', () => {
    const ops = planSheetWriteOps(sampleSpec());
    const urlOp = ops.dataValidations.find((v) => v.kind === 'url');
    expect(urlOp).toBeDefined();
    expect(urlOp?.columnIndex).toBe(6);
  });

  it('skips DataValidation for plain text columns', () => {
    const ops = planSheetWriteOps(sampleSpec());
    const textOps = ops.dataValidations.filter((v) => v.columnIndex === 0 || v.columnIndex === 1);
    expect(textOps).toHaveLength(0);
  });

  it('skips enum DataValidation if values list is missing', () => {
    const spec = sampleSpec({
      columns: [{ name: '結果', type: 'enum' }],
    });
    const ops = planSheetWriteOps(spec);
    expect(ops.dataValidations).toHaveLength(0);
  });

  it('emits row_background ConditionalFormat as row scope', () => {
    const ops = planSheetWriteOps(sampleSpec());
    const ng = ops.conditionalFormats.find(
      (c) => c.matchValue === 'NG' && c.columnIndex === 2,
    );
    expect(ng).toBeDefined();
    expect(ng?.scope).toBe('row');
    expect(ng?.backgroundColor).toBe('#fce8e6');
    expect(ng?.color).toBeUndefined();
  });

  it('emits cell background ConditionalFormat as cell scope', () => {
    const ops = planSheetWriteOps(sampleSpec());
    const hold = ops.conditionalFormats.find((c) => c.matchValue === '保留');
    expect(hold).toBeDefined();
    expect(hold?.scope).toBe('cell');
    expect(hold?.backgroundColor).toBe('#fef7e0');
  });

  it('emits cell color ConditionalFormat with text color set', () => {
    const ops = planSheetWriteOps(sampleSpec());
    const ok = ops.conditionalFormats.find((c) => c.matchValue === 'OK');
    expect(ok).toBeDefined();
    expect(ok?.scope).toBe('cell');
    expect(ok?.color).toBe('#1e7e34');
  });

  it('returns empty conditionalFormats when no visual styles defined', () => {
    const spec = sampleSpec({
      columns: [{ name: '項目', type: 'text' }],
    });
    const ops: SheetWriteOps = planSheetWriteOps(spec);
    expect(ops.conditionalFormats).toEqual([]);
  });

  it('skips conditionalFormats on columns without enum values', () => {
    const spec = sampleSpec({
      columns: [
        {
          name: 'X',
          type: 'enum',
          visual: { OK: { color: '#000000' } },
        },
      ],
    });
    expect(planSheetWriteOps(spec).conditionalFormats).toEqual([]);
  });
});

describe('resolveSheetName', () => {
  it('returns desiredName as-is when no conflict exists', () => {
    expect(resolveSheetName('受発注ワークフロー 検証シート', ['シート1', 'メモ'])).toBe(
      '受発注ワークフロー 検証シート',
    );
  });

  it('returns desiredName when existingNames is empty', () => {
    expect(resolveSheetName('受発注ワークフロー 検証シート', [])).toBe(
      '受発注ワークフロー 検証シート',
    );
  });

  it('adds (2) suffix when desiredName already exists', () => {
    expect(resolveSheetName('受発注ワークフロー 検証シート', ['受発注ワークフロー 検証シート'])).toBe(
      '受発注ワークフロー 検証シート (2)',
    );
  });

  it('escalates suffix until a free slot is found', () => {
    expect(
      resolveSheetName('受発注ワークフロー 検証シート', [
        '受発注ワークフロー 検証シート',
        '受発注ワークフロー 検証シート (2)',
        '受発注ワークフロー 検証シート (3)',
      ]),
    ).toBe('受発注ワークフロー 検証シート (4)');
  });

  it('treats existingNames as Set semantics (order-independent)', () => {
    expect(
      resolveSheetName('A', ['A (3)', 'A (2)', 'A']),
    ).toBe('A (4)');
  });
});

describe('applySheetValuesToSpec', () => {
  it('round-trips a single body row into Markdown table', () => {
    const spec = sampleSpec({
      columns: [
        { name: '項目', type: 'text' },
        { name: '結果', type: 'enum', values: ['OK', 'NG'] },
      ],
    });
    const result = applySheetValuesToSpec(spec, [
      ['項目', '結果'],
      ['ログイン正常', 'OK'],
      ['誤入力', 'NG'],
    ]);
    expect(result.body).toBe(
      ['| 項目 | 結果 |', '| --- | --- |', '| ログイン正常 | OK |', '| 誤入力 | NG |'].join('\n'),
    );
  });

  it('keeps spec columns unchanged (Sheets values do not redefine schema)', () => {
    const spec = sampleSpec();
    const result = applySheetValuesToSpec(spec, [
      ['項目', '手順', '結果', '実施日', '回数', '完了', '参考リンク'],
      ['正常', '正常入力', 'OK', '2026-06-18', '1', 'TRUE', 'https://example.com'],
    ]);
    expect(result.spec.columns).toEqual(spec.columns);
  });

  it('returns empty body when only header row exists', () => {
    const spec = sampleSpec({ columns: [{ name: '項目', type: 'text' }] });
    const result = applySheetValuesToSpec(spec, [['項目']]);
    expect(result.body).toBe(['| 項目 |', '| --- |'].join('\n'));
  });

  it('returns empty string when values are empty', () => {
    const spec = sampleSpec({ columns: [{ name: '項目', type: 'text' }] });
    expect(applySheetValuesToSpec(spec, []).body).toBe('');
  });
});

describe('validateSheetValues', () => {
  it('returns empty issues for fully valid sheet', () => {
    const spec = sampleSpec();
    const issues = validateSheetValues(spec, [
      ['項目', '手順', '結果', '実施日', '回数', '完了', '参考リンク'],
      ['正常', '入力', 'OK', '2026-06-18', '5', 'TRUE', 'https://example.com'],
    ]);
    expect(issues).toEqual([]);
  });

  it('flags unknown_column for header names not in spec', () => {
    const spec = sampleSpec({
      columns: [{ name: '項目', type: 'text' }],
    });
    const issues = validateSheetValues(spec, [
      ['項目', '未知列'],
      ['x', 'y'],
    ]);
    const unknown = issues.find((i) => i.kind === 'unknown_column');
    expect(unknown).toBeDefined();
    expect(unknown?.row).toBe(1);
    expect(unknown?.col).toBe(2);
    expect(unknown?.headerName).toBe('未知列');
  });

  it('flags enum_out_of_values when cell value not in column values', () => {
    const spec = sampleSpec({
      columns: [{ name: '結果', type: 'enum', values: ['OK', 'NG'] }],
    });
    const issues = validateSheetValues(spec, [
      ['結果'],
      ['不明'],
    ]);
    const issue = issues.find((i) => i.kind === 'enum_out_of_values');
    expect(issue).toBeDefined();
    expect(issue?.row).toBe(2);
    expect(issue?.col).toBe(1);
    expect(issue?.cellValue).toBe('不明');
  });

  it('allows empty cells for enum columns (treated as 未入力 / OK)', () => {
    const spec = sampleSpec({
      columns: [{ name: '結果', type: 'enum', values: ['OK', 'NG'] }],
    });
    const issues = validateSheetValues(spec, [
      ['結果'],
      [''],
      [null],
    ]);
    expect(issues.filter((i) => i.kind === 'enum_out_of_values')).toEqual([]);
  });

  it('flags invalid_date for non-ISO date strings', () => {
    const spec = sampleSpec({
      columns: [{ name: '実施日', type: 'date' }],
    });
    const issues = validateSheetValues(spec, [
      ['実施日'],
      ['2026/06/18'],
      ['昨日'],
    ]);
    const dateIssues = issues.filter((i) => i.kind === 'invalid_date');
    expect(dateIssues).toHaveLength(2);
    expect(dateIssues[0]?.cellValue).toBe('2026/06/18');
  });

  it('allows Date objects for date columns (Sheets returns native Date)', () => {
    const spec = sampleSpec({
      columns: [{ name: '実施日', type: 'date' }],
    });
    const issues = validateSheetValues(spec, [
      ['実施日'],
      [new Date('2026-06-18T00:00:00Z')],
    ]);
    expect(issues.filter((i) => i.kind === 'invalid_date')).toEqual([]);
  });

  it('allows empty date cells', () => {
    const spec = sampleSpec({
      columns: [{ name: '実施日', type: 'date' }],
    });
    expect(validateSheetValues(spec, [['実施日'], ['']])).toEqual([]);
  });

  it('flags invalid_number for non-numeric values', () => {
    const spec = sampleSpec({
      columns: [{ name: '回数', type: 'number' }],
    });
    const issues = validateSheetValues(spec, [['回数'], ['abc']]);
    expect(issues[0]?.kind).toBe('invalid_number');
  });

  it('flags number_out_of_range when below min', () => {
    const spec = sampleSpec({
      columns: [{ name: '回数', type: 'number', min: 1, max: 10 }],
    });
    const issues = validateSheetValues(spec, [['回数'], ['0']]);
    expect(issues[0]?.kind).toBe('number_out_of_range');
  });

  it('flags number_out_of_range when above max', () => {
    const spec = sampleSpec({
      columns: [{ name: '回数', type: 'number', min: 1, max: 10 }],
    });
    const issues = validateSheetValues(spec, [['回数'], ['11']]);
    expect(issues[0]?.kind).toBe('number_out_of_range');
  });

  it('accepts numeric values within min/max range', () => {
    const spec = sampleSpec({
      columns: [{ name: '回数', type: 'number', min: 1, max: 10 }],
    });
    expect(validateSheetValues(spec, [['回数'], ['1'], ['10'], [5]])).toEqual([]);
  });

  it('flags invalid_checkbox for non-boolean values', () => {
    const spec = sampleSpec({
      columns: [{ name: '完了', type: 'checkbox' }],
    });
    const issues = validateSheetValues(spec, [['完了'], ['まだ']]);
    expect(issues[0]?.kind).toBe('invalid_checkbox');
  });

  it('accepts TRUE/FALSE/true/false/boolean for checkbox columns', () => {
    const spec = sampleSpec({
      columns: [{ name: '完了', type: 'checkbox' }],
    });
    expect(
      validateSheetValues(spec, [
        ['完了'],
        ['TRUE'],
        ['FALSE'],
        ['true'],
        ['false'],
        [true],
        [false],
        [''],
      ]),
    ).toEqual([]);
  });

  it('flags invalid_url for non-http(s) URLs', () => {
    const spec = sampleSpec({
      columns: [{ name: '参考リンク', type: 'url' }],
    });
    const issues = validateSheetValues(spec, [
      ['参考リンク'],
      ['notaurl'],
      ['ftp://example.com'],
    ]);
    const urlIssues = issues.filter((i) => i.kind === 'invalid_url');
    expect(urlIssues).toHaveLength(2);
  });

  it('accepts http and https URLs for url columns', () => {
    const spec = sampleSpec({
      columns: [{ name: '参考リンク', type: 'url' }],
    });
    expect(
      validateSheetValues(spec, [
        ['参考リンク'],
        ['http://example.com'],
        ['https://example.com/path?q=1'],
        [''],
      ]),
    ).toEqual([]);
  });

  it('skips validation for text / multiline_text columns', () => {
    const spec = sampleSpec({
      columns: [
        { name: '項目', type: 'text' },
        { name: '手順', type: 'multiline_text' },
      ],
    });
    const issues = validateSheetValues(spec, [
      ['項目', '手順'],
      ['任意文字列', '改行\nあり'],
    ]);
    expect(issues).toEqual([]);
  });

  it('flags missing required header columns separately from unknown_column', () => {
    const spec = sampleSpec({
      columns: [
        { name: '項目', type: 'text' },
        { name: '結果', type: 'enum', values: ['OK'] },
      ],
    });
    const issues: SheetValidationIssue[] = validateSheetValues(spec, [['項目'], ['x']]);
    const missing = issues.find((i) => i.kind === 'missing_column');
    expect(missing).toBeDefined();
    expect(missing?.headerName).toBe('結果');
  });

  it('returns empty issues when sheet values are empty', () => {
    expect(validateSheetValues(sampleSpec(), [])).toEqual([]);
  });
});
