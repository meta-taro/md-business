import { describe, it, expect } from 'vitest';
import { parseTsv, type ImportBackChange } from '@md-business/schema-test-spec-tsv';
import { readSheetExportProfiles } from './sheetExport';
import { applyImportBack, planSheetImportBack } from './sheetImportBack';

const TAB = String.fromCharCode(9);

function sheet(directives: readonly string[], rows: readonly (readonly string[])[]) {
  return parseTsv(
    [
      '#! md-business:test-spec-tsv/v1',
      ...directives.map((directive) => `#@ ${directive}`),
      ['No.:number', '項目', '結果:enum(OK|NG)'].join(TAB),
      ...rows.map((cells) => cells.join(TAB)),
    ].join('\n'),
  );
}

const ROWS = [
  ['1', 'ログインできる', ''],
  ['2', 'ログアウトできる', ''],
];

function planFrom(directive: string, text: string, rows: readonly (readonly string[])[] = ROWS) {
  const doc = sheet([directive], rows);
  const [profile] = readSheetExportProfiles(doc);
  return { doc, plan: planSheetImportBack(doc, profile!, text) };
}

const FORM = 'export 提出用 columns=No.,結果 key=No.';

describe('planSheetImportBack', () => {
  it('貼り付けられた表を読んで、変わったセルだけを計画にする', () => {
    const { plan } = planFrom(FORM, [`No.${TAB}結果`, `1${TAB}OK`, `2${TAB}NG`].join('\n'));

    expect(plan.changes).toEqual([
      { row: 0, column: 2, before: '', after: 'OK' },
      { row: 1, column: 2, before: '', after: 'NG' },
    ]);
  });

  // 表計算からコピーすると、改行を含むセルは二重引用符で囲まれて届く。囲みを外さずに
  // 当てると、引用符ごと正本へ入る。
  it('囲まれたセルは囲みを外して読む', () => {
    const { plan } = planFrom(FORM, [`No.${TAB}結果`, `1${TAB}"OK"`].join('\n'));

    expect(plan.changes).toEqual([{ row: 0, column: 2, before: '', after: 'OK' }]);
  });

  it('何も貼られていなければ断る', () => {
    expect(planFrom(FORM, '').plan.rejected).toBe('no-key-column');
  });
});

describe('applyImportBack', () => {
  it('計画のセルだけを書き換えた新しい doc を返す（入力は不変）', () => {
    const { doc, plan } = planFrom(FORM, [`No.${TAB}結果`, `1${TAB}OK`].join('\n'));
    const next = applyImportBack(doc, plan.changes);

    expect(next.rows).toEqual([
      ['1', 'ログインできる', 'OK'],
      ['2', 'ログアウトできる', ''],
    ]);
    expect(doc.rows[0]?.[2]).toBe('');
  });

  it('変えるものが無ければ入力をそのまま返す（履歴に空を積まない）', () => {
    const doc = sheet([FORM], ROWS);

    expect(applyImportBack(doc, [])).toBe(doc);
  });

  // 末尾の空セルは省略できる（`validateTsv` が許す形）。詰めずに書くと穴が空く。
  it('末尾セルが省略された短い行にも書ける', () => {
    const doc = sheet([FORM], [['1', 'ログインできる']]);
    const changes: ImportBackChange[] = [{ row: 0, column: 2, before: '', after: 'OK' }];

    expect(applyImportBack(doc, changes).rows).toEqual([['1', 'ログインできる', 'OK']]);
  });

  it('無い行を指す計画は捨てる', () => {
    const doc = sheet([FORM], ROWS);
    const changes: ImportBackChange[] = [{ row: 9, column: 2, before: '', after: 'OK' }];

    expect(applyImportBack(doc, changes)).toBe(doc);
  });
});
