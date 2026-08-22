import { describe, it, expect } from 'vitest';
import { planImportBack } from '../src/importBack.js';
import { readExportProfiles } from '../src/export.js';
import { parseTsv } from '../src/parse.js';
import type { TsvDocument } from '../src/parse.js';

/**
 * 逆取り込み（提出様式 → 正本）。
 *
 * 出す口はあるのに戻す口が無いと、先方が提出物の側に書いた結果を人が目で写すことになる。
 * 写し漏れは提出物の側にしか出ないので、手元を見ても見つからない。
 *
 * 契約:
 * - 当てるのは **キー列だけ**。行番号では当てない（提出物は先方の手元で並べ替えられる）。
 * - **行は足さない**。正本に無いキーは報告するだけ。
 * - **変わったセルだけ**を変更にする。全セルを書き戻すと、提出中に正本側で直した内容が黙って消える。
 * - **書けない列は書かない**（計算列 / 行 ID 列 / 提出物に 2 回出ている列）。黙らず報告する。
 * - **畳んだ改行は戻せない**（`newline=space`）。取り込み自体を断る。
 */

const TAB = String.fromCharCode(9);
/** 正本の中では改行はバックスラッシュ表記。1 レコード = 1 物理行を崩さないため。 */
const NL = String.fromCharCode(92) + 'n';

function sheet(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
  directives: readonly string[] = [],
): TsvDocument {
  const lines = [
    '#! md-business:test-spec-tsv/v1',
    '#@ rowid _id',
    ...directives.map((directive) => `#@ ${directive}`),
    columns.join(TAB),
    ...rows.map((cells) => cells.join(TAB)),
  ];
  return parseTsv(lines.join('\n'));
}

const COLUMNS = ['No.:number', '項目', '手順', '結果:enum(OK|NG)', '_id'];

const ROWS = [
  ['1', 'ログインできる', '開く' + NL + '入れる', '', 'r000000000001'],
  ['2', 'ログアウトできる', '出る', '', 'r000000000002'],
];

/** 宣言 1 本のシートと、貼り付けられた表から計画を立てる。 */
function plan(
  directive: string,
  pasted: readonly (readonly string[])[],
  rows: readonly (readonly string[])[] = ROWS,
  extra: readonly string[] = [],
) {
  const doc = sheet(COLUMNS, rows, [directive, ...extra]);
  const profiles = readExportProfiles(
    doc.directives,
    doc.columns.map((column) => column.name),
  );
  expect(profiles).toHaveLength(1);
  return planImportBack(doc, profiles[0]!, pasted);
}

const FORM = 'export 提出用 columns=No.,項目,結果 key=No.';

describe('planImportBack', () => {
  it('キー列で当てて、変わったセルだけを変更にする', () => {
    const result = plan(FORM, [
      ['No.', '項目', '結果'],
      ['2', 'ログアウトできる', 'OK'],
      ['1', 'ログインできる', 'NG'],
    ]);
    expect(result.changes).toEqual([
      { row: 1, column: 3, before: '', after: 'OK' },
      { row: 0, column: 3, before: '', after: 'NG' },
    ]);
    expect(result.rejected).toBeNull();
  });

  it('変わっていなければ何も変更にしない', () => {
    const result = plan(FORM, [
      ['No.', '項目', '結果'],
      ['1', 'ログインできる', ''],
    ]);
    expect(result.changes).toEqual([]);
  });

  it('様式が出していない列は、見出しにあっても書かない', () => {
    const result = plan(FORM, [
      ['No.', '項目', '結果', '手順'],
      ['1', 'ログインできる', '', '開いて入れる'],
    ]);
    expect(result.changes).toEqual([]);
  });

  it('正本に無いキーは報告するだけで、行は足さない', () => {
    const result = plan(FORM, [
      ['No.', '項目', '結果'],
      ['3', '新しく足された行', 'OK'],
    ]);
    expect(result.changes).toEqual([]);
    expect(result.unknownKeys).toEqual(['3']);
  });

  it('提出物の側でキーが 2 回出ていれば、そのキーは触らない', () => {
    const result = plan(FORM, [
      ['No.', '項目', '結果'],
      ['1', 'ログインできる', 'OK'],
      ['1', 'ログインできる', 'NG'],
      ['2', 'ログアウトできる', 'OK'],
    ]);
    expect(result.duplicateKeys).toEqual(['1']);
    expect(result.changes).toEqual([{ row: 1, column: 3, before: '', after: 'OK' }]);
  });

  it('正本の側でキーが 2 回出ていれば、そのキーは触らない', () => {
    const result = plan(
      FORM,
      [
        ['No.', '項目', '結果'],
        ['1', 'ログインできる', 'OK'],
      ],
      [
        ['1', 'ログインできる', '', '', 'r000000000001'],
        ['1', '番号を直し忘れた行', '', '', 'r000000000002'],
      ],
    );
    expect(result.duplicateKeys).toEqual(['1']);
    expect(result.changes).toEqual([]);
  });

  it('キーが空の行は当てずに数える', () => {
    const result = plan(FORM, [
      ['No.', '項目', '結果'],
      ['', '見出し代わりの行', ''],
      [' ', '', ''],
    ]);
    expect(result.skipped).toBe(2);
    expect(result.unknownKeys).toEqual([]);
  });

  it('キーの前後の空白は無視して当てる（表計算を通ると付く）', () => {
    const result = plan(FORM, [
      ['No.', '項目', '結果'],
      [' 1 ', 'ログインできる', 'OK'],
    ]);
    expect(result.changes).toEqual([{ row: 0, column: 3, before: '', after: 'OK' }]);
  });

  it('様式が出しているのに見出しに無い列は報告する', () => {
    const result = plan(FORM, [
      ['No.', '結果'],
      ['1', 'OK'],
    ]);
    expect(result.missingColumns).toEqual(['項目']);
    expect(result.changes).toEqual([{ row: 0, column: 3, before: '', after: 'OK' }]);
  });
});

describe('取り込まない様式', () => {
  it('key= が無ければ断る', () => {
    const result = plan('export 提出用 columns=No.,結果', [
      ['No.', '結果'],
      ['1', 'OK'],
    ]);
    expect(result.rejected).toBe('no-key');
    expect(result.changes).toEqual([]);
  });

  // 空白へ畳んだ改行は戻せない。畳まれた値ともともと空白だった値の区別が付かないので、
  // 取り込めば触っていないセルからも改行が消える。
  it('newline=space なら断る', () => {
    const result = plan('export 提出用 columns=No.,手順 newline=space key=No.', [
      ['No.', '手順'],
      ['1', '開く 入れる'],
    ]);
    expect(result.rejected).toBe('folded-newline');
    expect(result.changes).toEqual([]);
  });

  it('見出しにキー列が無ければ断る', () => {
    const result = plan(FORM, [
      ['項目', '結果'],
      ['ログインできる', 'OK'],
    ]);
    expect(result.rejected).toBe('no-key-column');
  });

  it('見出しの行すら無ければ断る', () => {
    expect(plan(FORM, []).rejected).toBe('no-key-column');
  });
});

describe('書けない列', () => {
  it('計算列は書かずに報告する', () => {
    const result = plan(
      'export 提出用 columns=No.,項目,結果 key=項目',
      [
        ['No.', '項目', '結果'],
        ['9', 'ログインできる', 'OK'],
      ],
      ROWS,
      ['computed No. = rowNumber()'],
    );
    expect(result.lockedColumns).toEqual(['No.']);
    expect(result.changes).toEqual([{ row: 0, column: 3, before: '', after: 'OK' }]);
  });

  it('行 ID 列は書かずに報告する', () => {
    const result = plan('export 提出用 columns=No.,_id,結果 key=No.', [
      ['No.', '_id', '結果'],
      ['1', 'r999999999999', 'OK'],
    ]);
    expect(result.lockedColumns).toEqual(['_id']);
    expect(result.changes).toEqual([{ row: 0, column: 3, before: '', after: 'OK' }]);
  });

  // 同じ値を 2 列要求する様式がある。返ってきた表で片方だけ直されていても、
  // どちらが本当かはこちらでは決められない。
  it('提出物に 2 回出ている列は書かずに報告する', () => {
    const result = plan('export 提出用 columns=No.,結果,結果 key=No.', [
      ['No.', '結果', '結果'],
      ['1', 'OK', 'NG'],
    ]);
    expect(result.lockedColumns).toEqual(['結果']);
    expect(result.changes).toEqual([]);
  });
});

describe('提出様式の都合を正本へ持ち込まない', () => {
  it('blank= で埋めた記号は空へ戻す', () => {
    const result = plan(
      'export 提出用 columns=No.,結果 blank=- key=No.',
      [
        ['No.', '結果'],
        ['1', '-'],
      ],
      [['1', 'ログインできる', '', 'OK', 'r000000000001']],
    );
    expect(result.changes).toEqual([{ row: 0, column: 3, before: 'OK', after: '' }]);
  });

  it('newline=escape はバックスラッシュ表記を改行へ戻す', () => {
    const result = plan('export 提出用 columns=No.,手順 newline=escape key=No.', [
      ['No.', '手順'],
      ['1', '開く' + NL + '入れる' + NL + '閉じる'],
    ]);
    expect(result.changes).toEqual([
      { row: 0, column: 2, before: '開く\n入れる', after: '開く\n入れる\n閉じる' },
    ]);
  });

  it('渡された doc は書き換えない', () => {
    const doc = sheet(COLUMNS, ROWS, [FORM]);
    const before = JSON.stringify(doc);
    const profiles = readExportProfiles(
      doc.directives,
      doc.columns.map((column) => column.name),
    );
    planImportBack(doc, profiles[0]!, [
      ['No.', '項目', '結果'],
      ['1', 'ログインできる', 'OK'],
    ]);
    expect(JSON.stringify(doc)).toBe(before);
  });
});
