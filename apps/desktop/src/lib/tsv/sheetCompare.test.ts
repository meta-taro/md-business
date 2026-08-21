import { describe, it, expect } from 'vitest';
import { cellKey, compareWithVersion } from './sheetCompare';
import { loadGridDoc } from './gridDoc';

/**
 * 前の版との突き合わせ（グリッドへ渡す形まで）。
 *
 * 突き合わせそのものは schema 側の `diffSheets`。ここが引き受けるのは、
 * **git から返ってきたテキストを、印を引ける形へ落とすところ**だけ。
 *
 * - その版にファイルが無い（`null`）ことと、読めない中身であることを分ける。
 *   どちらも「比べられない」だが、直す先が違う（版の選び直し / ファイルの取り違え）。
 * - 比べられないときは印を 1 つも出さない。**一部だけ出すほうが危ない**。
 *   赤が付いていない行を「変えていない行」として読むので、出しかけは嘘になる。
 */

function sheet(rows: readonly (readonly string[])[], columns = ['No.:number', '項目', '結果']): string {
  const tab = '\t';
  return [
    '#! md-business:test-spec-tsv/v1',
    '#@ rowid _id',
    [...columns, '_id'].join(tab),
    ...rows.map((cells) => cells.join(tab)),
  ].join('\n');
}

const ID1 = 'r000000000001';
const ID2 = 'r000000000002';

describe('compareWithVersion', () => {
  it('変わったセルを 行 ID と列名 の鍵で返す', () => {
    const previous = sheet([
      ['1', 'ログインできる', '未実施', ID1],
      ['2', 'ログアウトできる', '未実施', ID2],
    ]);
    const current = loadGridDoc(
      sheet([
        ['1', 'ログインできる', 'OK', ID1],
        ['2', 'ログアウトできる', '未実施', ID2],
      ]),
    );

    const result = compareWithVersion(previous, current.doc);

    expect(result.issue).toBeNull();
    expect([...result.changed]).toEqual([cellKey(ID1, '結果')]);
    expect([...result.added]).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('増えた行と増えた列を返す', () => {
    const previous = sheet([['1', 'ログインできる', ID1]], ['No.:number', '項目']);
    const current = loadGridDoc(
      sheet([
        ['1', 'ログインできる', 'OK', ID1],
        ['2', 'ログアウトできる', '未実施', ID2],
      ]),
    );

    const result = compareWithVersion(previous, current.doc);

    expect([...result.added]).toEqual([ID2]);
    expect([...result.addedColumns]).toEqual(['結果']);
    // 増えた列のセルは変わったセルに数えない（行ごと・列ごとの印で足りる）。
    expect([...result.changed]).toEqual([]);
  });

  it('消えた行を中身ごと返す', () => {
    const previous = sheet([
      ['1', 'ログインできる', 'OK', ID1],
      ['2', '使わなくなった確認', '保留', ID2],
    ]);
    const current = loadGridDoc(sheet([['1', 'ログインできる', 'OK', ID1]]));

    const result = compareWithVersion(previous, current.doc);

    expect(result.removed).toEqual([
      { id: ID2, cells: { 'No.': '2', 項目: '使わなくなった確認', 結果: '保留' } },
    ]);
  });

  it('控え行は突き合わせから外さない', () => {
    // 控えは「表から外しただけ」で、ファイルには残っている。外したまま比べると
    // 控えにした行が全部「消えた行」になり、消したのか控えたのか区別できなくなる。
    const previous = sheet([
      ['1', 'ログインできる', 'OK', ID1],
      ['2', '様子見の確認', '保留', ID2],
    ]);
    const current = loadGridDoc(
      [
        '#! md-business:test-spec-tsv/v1',
        '#@ rowid _id',
        `#@ hidden ${ID2}`,
        ['No.:number', '項目', '結果', '_id'].join('\t'),
        ['1', 'ログインできる', 'OK', ID1].join('\t'),
        ['2', '様子見の確認', '保留', ID2].join('\t'),
      ].join('\n'),
    );

    const result = compareWithVersion(previous, current.doc, current.hidden);

    expect(result.issue).toBeNull();
    expect(result.removed).toEqual([]);
    expect([...result.changed]).toEqual([]);
  });

  it('その版にファイルが無ければ、無いと返す', () => {
    const current = loadGridDoc(sheet([['1', 'ログインできる', 'OK', ID1]]));

    const result = compareWithVersion(null, current.doc);

    expect(result.issue).toBe('missing');
    expect([...result.changed]).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('検証シートでない中身とは比べない', () => {
    const current = loadGridDoc(sheet([['1', 'ログインできる', 'OK', ID1]]));

    const result = compareWithVersion('# ただのメモ\n\nこれは表ではない', current.doc);

    expect(result.issue).toBe('unreadable');
    expect([...result.changed]).toEqual([]);
  });

  it('前の版に行 ID が無ければ、行番号へ落とさず比べないと返す', () => {
    const previous = [
      '#! md-business:test-spec-tsv/v1',
      ['No.:number', '項目', '結果'].join('\t'),
      ['1', 'ログインできる', 'OK'].join('\t'),
    ].join('\n');
    const current = loadGridDoc(sheet([['1', 'ログインできる', 'NG', ID1]]));

    const result = compareWithVersion(previous, current.doc);

    expect(result.issue).toBe('no-row-id');
    expect([...result.changed]).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('同じ中身なら印を 1 つも出さない', () => {
    const source = sheet([['1', 'ログインできる', 'OK', ID1]]);
    const current = loadGridDoc(source);

    const result = compareWithVersion(source, current.doc);

    expect(result.issue).toBeNull();
    expect(result.changed.size).toBe(0);
    expect(result.added.size).toBe(0);
    expect(result.addedColumns.size).toBe(0);
    expect(result.removed).toEqual([]);
  });
});
