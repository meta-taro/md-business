import { describe, it, expect } from 'vitest';
import { parseTsv } from '@md-business/schema-test-spec-tsv';
import { exportProfileText, readSheetExportProfiles } from './sheetExport';

const TAB = String.fromCharCode(9);
/** 正本の中では改行はバックスラッシュ表記。1 レコード = 1 物理行を崩さないため。 */
const NL = String.fromCharCode(92) + 'n';

function sheet(directives: readonly string[], rows: readonly (readonly string[])[]) {
  return parseTsv(
    [
      '#! md-business:test-spec-tsv/v1',
      ...directives.map((directive) => `#@ ${directive}`),
      ['No.:number', '項目', '手順', '結果:enum(OK|NG)'].join(TAB),
      ...rows.map((cells) => cells.join(TAB)),
    ].join('\n'),
  );
}

describe('readSheetExportProfiles', () => {
  it('宣言が無ければ空', () => {
    expect(readSheetExportProfiles(sheet([], []))).toEqual([]);
  });

  it('宣言した様式を返す', () => {
    const profiles = readSheetExportProfiles(sheet(['export 提出用 columns=No.,項目'], []));

    expect(profiles.map((profile) => profile.name)).toEqual(['提出用']);
  });
});

describe('exportProfileText', () => {
  it('見出しの後にデータ行を並べ、タブで区切る', () => {
    const doc = sheet(
      ['export 提出用 columns=No.,結果'],
      [
        ['1', 'ログインできる', '開く', 'OK'],
        ['2', 'ログアウトできる', '', ''],
      ],
    );
    const [profile] = readSheetExportProfiles(doc);

    expect(exportProfileText(doc, profile!)).toBe(
      [`No.${TAB}結果`, `1${TAB}OK`, `2${TAB}`].join('\n'),
    );
  });

  it('セル内改行を含む値は囲んで渡す（貼り付け先で行が割れない）', () => {
    const doc = sheet(
      ['export 提出用 columns=手順'],
      [['1', 'ログインできる', `開く${NL}入れる`, 'OK']],
    );
    const [profile] = readSheetExportProfiles(doc);

    expect(exportProfileText(doc, profile!)).toBe(`手順\n"開く\n入れる"`);
  });

  it('newline=space なら囲みも要らなくなる', () => {
    const doc = sheet(
      ['export 提出用 columns=手順 newline=space'],
      [['1', 'ログインできる', `開く${NL}入れる`, 'OK']],
    );
    const [profile] = readSheetExportProfiles(doc);

    expect(exportProfileText(doc, profile!)).toBe('手順\n開く 入れる');
  });

  it('blank= の埋め方が効く（正本の空セルはそのまま）', () => {
    const doc = sheet(
      ['export 提出用 columns=結果 blank=-'],
      [['1', 'ログインできる', '開く', '']],
    );
    const [profile] = readSheetExportProfiles(doc);

    expect(exportProfileText(doc, profile!)).toBe('結果\n-');
    expect(doc.rows[0]?.[3]).toBe('');
  });
});
