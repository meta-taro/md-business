import { describe, it, expect } from 'vitest';
import { buildExportTable, findExportProfile, readExportProfiles } from '../src/export.js';
import { parseTsv } from '../src/parse.js';
import type { TsvDocument } from '../src/parse.js';

/**
 * 提出様式への書き出し。
 *
 * 正本（読み書きしやすい列）と提出物（列順・空欄の埋め方・改行の扱いが決まっている）は
 * 形が違う。いまは提出のたびに「貼り付け用」を手で組み直していて、組み直しの間に
 * **正本と提出物がずれる**。ずれは提出物の側にしか出ないので、後から見つからない。
 *
 * 最重要契約:
 * - **正本は書き換えない**。空セルの埋め方（`blank=-`）は提出様式の都合であって、
 *   正本の都合ではない。正本の空セルは空のまま（`docs/data-cell-conventions.md`）。
 * - **宣言が壊れていれば、その宣言ごと捨てる**。半端に効いた様式で提出物が出るより、
 *   様式が出てこないほうが気づける（`#@ link` / `#@ computed` と同じ判断）。
 * - **行 ID 列は既定で出さない**。提出先には要らない列で、付いていると毎回消される。
 *   ただし `columns=` に名前で書いてあれば出す（要ると言っているのはこちらではない）。
 */

const TAB = String.fromCharCode(9);
/** 正本の中では改行はバックスラッシュ表記。1 レコード = 1 物理行を崩さないため。 */
const NL = String.fromCharCode(92) + 'n';

/** 見出しと行から検証シートを組む。ID 列は末尾（既定名 `_id`）。 */
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
  ['1', 'ログインできる', '開く' + NL + '入れる', 'OK', 'r000000000001'],
  ['2', 'ログアウトできる', '', '', 'r000000000002'],
];

/** 宣言 1 本のシートから、その様式で書き出した表を得る。 */
function exported(directive: string, rows: readonly (readonly string[])[] = ROWS) {
  const doc = sheet(COLUMNS, rows, [directive]);
  const profiles = readExportProfiles(
    doc.directives,
    doc.columns.map((column) => column.name),
  );
  expect(profiles).toHaveLength(1);
  return buildExportTable(doc, profiles[0]!);
}

describe('readExportProfiles', () => {
  it('宣言が無ければ何も返さない', () => {
    const doc = sheet(COLUMNS, ROWS);
    expect(readExportProfiles(doc.directives, doc.columns.map((c) => c.name))).toEqual([]);
  });

  it('名前だけの宣言を受け付ける（正本のまま出す様式）', () => {
    const table = exported('export 提出用');

    // 行 ID 列は既定で落ちる。
    expect(table.columns).toEqual(['No.', '項目', '手順', '結果']);
    expect(table.rows[0]).toEqual(['1', 'ログインできる', '開く\n入れる', 'OK']);
    // 空セルは空のまま（既定では埋めない）。
    expect(table.rows[1]).toEqual(['2', 'ログアウトできる', '', '']);
  });

  it('名前が無い宣言は捨てる', () => {
    const doc = sheet(COLUMNS, ROWS, ['export']);
    expect(readExportProfiles(doc.directives, doc.columns.map((c) => c.name))).toEqual([]);
  });

  it('同じ名前が 2 本あれば後勝ち', () => {
    const doc = sheet(COLUMNS, ROWS, [
      'export 提出用 columns=No.,項目',
      'export 提出用 columns=項目,結果',
    ]);
    const profiles = readExportProfiles(
      doc.directives,
      doc.columns.map((c) => c.name),
    );

    expect(profiles).toHaveLength(1);
    expect(buildExportTable(doc, profiles[0]!).columns).toEqual(['項目', '結果']);
  });

  it('名前が違えば両方残り、宣言の順に並ぶ', () => {
    const doc = sheet(COLUMNS, ROWS, ['export 提出用 columns=No.', 'export 社内用 columns=項目']);
    expect(
      readExportProfiles(
        doc.directives,
        doc.columns.map((c) => c.name),
      ).map((profile) => profile.name),
    ).toEqual(['提出用', '社内用']);
  });

  it('未知のオプションキーがあれば宣言ごと捨てる', () => {
    const doc = sheet(COLUMNS, ROWS, ['export 提出用 columns=No. width=80']);
    expect(readExportProfiles(doc.directives, doc.columns.map((c) => c.name))).toEqual([]);
  });

  it('列定義に無い列を指していれば宣言ごと捨てる', () => {
    const doc = sheet(COLUMNS, ROWS, ['export 提出用 columns=No.,担当']);
    expect(readExportProfiles(doc.directives, doc.columns.map((c) => c.name))).toEqual([]);
  });

  it('id から様式を引く。無ければ null', () => {
    const doc = sheet(COLUMNS, ROWS, ['export 提出用 columns=No.']);
    const profiles = readExportProfiles(
      doc.directives,
      doc.columns.map((c) => c.name),
    );

    expect(findExportProfile(profiles, '提出用')?.name).toBe('提出用');
    expect(findExportProfile(profiles, '社外用')).toBeNull();
  });
});

describe('columns=', () => {
  it('指定した列だけを、指定した順で出す', () => {
    const table = exported('export 提出用 columns=結果,項目');

    expect(table.columns).toEqual(['結果', '項目']);
    expect(table.rows).toEqual([
      ['OK', 'ログインできる'],
      ['', 'ログアウトできる'],
    ]);
  });

  it('列名に空白を含められる', () => {
    const doc = sheet(
      ['No.:number', '対応 状態', '_id'],
      [['1', '反映済み', 'r000000000001']],
      ['export 提出用 columns=対応 状態,No. blank=-'],
    );
    const profiles = readExportProfiles(
      doc.directives,
      doc.columns.map((c) => c.name),
    );

    expect(buildExportTable(doc, profiles[0]!).columns).toEqual(['対応 状態', 'No.']);
  });

  it('行 ID 列も、名前で書いてあれば出す', () => {
    const table = exported('export 提出用 columns=No.,_id');

    expect(table.columns).toEqual(['No.', '_id']);
    expect(table.rows[0]).toEqual(['1', 'r000000000001']);
  });

  it('同じ列を 2 回書けば 2 回出す（提出様式が同じ値を 2 列要求することがある）', () => {
    const table = exported('export 提出用 columns=No.,No.');

    expect(table.columns).toEqual(['No.', 'No.']);
    expect(table.rows[0]).toEqual(['1', '1']);
  });
});

describe('blank=', () => {
  it('空セルを埋める', () => {
    const table = exported('export 提出用 columns=項目,手順,結果 blank=-');

    expect(table.rows[1]).toEqual(['ログアウトできる', '-', '-']);
  });

  it('正本は書き換えない', () => {
    const doc = sheet(COLUMNS, ROWS, ['export 提出用 columns=結果 blank=-']);
    const profiles = readExportProfiles(
      doc.directives,
      doc.columns.map((c) => c.name),
    );

    buildExportTable(doc, profiles[0]!);

    expect(doc.rows[1]?.[3]).toBe('');
  });

  it('セルが足りない行は空セルとして埋める', () => {
    const table = exported('export 提出用 columns=結果 blank=-', [['1', 'ログインできる']]);

    expect(table.rows).toEqual([['-']]);
  });

  it('空白だけのセルも空として埋める', () => {
    const table = exported('export 提出用 columns=結果 blank=-', [
      ['1', 'ログインできる', '', '   ', 'r000000000001'],
    ]);

    expect(table.rows).toEqual([['-']]);
  });
});

describe('newline=', () => {
  it('既定は実改行のまま', () => {
    expect(exported('export 提出用 columns=手順').rows[0]).toEqual(['開く\n入れる']);
  });

  it('space は改行を半角空白に畳む', () => {
    expect(exported('export 提出用 columns=手順 newline=space').rows[0]).toEqual(['開く 入れる']);
  });

  it('escape は正本と同じバックスラッシュ表記にする', () => {
    expect(exported('export 提出用 columns=手順 newline=escape').rows[0]).toEqual([
      '開く\\n入れる',
    ]);
  });

  it('知らないモードは宣言ごと捨てる', () => {
    const doc = sheet(COLUMNS, ROWS, ['export 提出用 columns=手順 newline=none']);
    expect(readExportProfiles(doc.directives, doc.columns.map((c) => c.name))).toEqual([]);
  });
});

describe('key=', () => {
  /** 戻す口（逆取り込み）で行を当てる列。出す側は使わないが、様式は 1 本でなければならない。 */
  function profile(directive: string) {
    const doc = sheet(COLUMNS, ROWS, [directive]);
    return readExportProfiles(
      doc.directives,
      doc.columns.map((c) => c.name),
    );
  }

  it('書かなければ null（出せるが戻せない様式）', () => {
    expect(profile('export 提出用 columns=No.,結果')[0]?.key).toBeNull();
  });

  it('列名を書けばそれを持つ', () => {
    expect(profile('export 提出用 columns=No.,結果 key=No.')[0]?.key).toBe('No.');
  });

  it('列定義に無い列を指していれば宣言ごと捨てる', () => {
    expect(profile('export 提出用 columns=No.,結果 key=通番')).toEqual([]);
  });

  // 提出物にキー列が出ていなければ、返ってきた表のどの行がどれだか分からない。
  it('出さない列を指していれば宣言ごと捨てる', () => {
    expect(profile('export 提出用 columns=結果 key=No.')).toEqual([]);
  });

  it('columns= を書いていなければ、既定で出る列から選べる', () => {
    expect(profile('export 提出用 key=No.')[0]?.key).toBe('No.');
  });

  // 行 ID 列は既定で出ない。名前で書いていない限り提出物に無い。
  it('columns= を書かずに行 ID 列を指していれば宣言ごと捨てる', () => {
    expect(profile('export 提出用 key=_id')).toEqual([]);
  });
});
