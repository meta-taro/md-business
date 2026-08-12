import { describe, expect, it } from 'vitest';
import { checkColumnLink, readColumnLinks, splitLinkedValues } from '../src/columnLink.js';
import type { ColumnLink } from '../src/columnLink.js';
import type { TsvDocument } from '../src/parse.js';

/**
 * 列のリンク定義（`#@ link <列名> -> <ファイル>#<列名>`）。
 *
 * 最重要契約:
 * - **多値が既定**。1 セルに区切り文字で複数の参照先が入る。
 * - **参照先を読めないのは警告**。ワークスペースの一部だけ開いていることがあり、
 *   落とすと開くたびに赤くなる。
 * - **検証は両方向**。参照元のタイポと、参照先の取りこぼしは別の欠落。
 */

const CASE_COLUMNS = ['No.', '項目', '観点#'];
const OBSERVATION_COLUMNS = ['観点#', '観点'];

function docOf(rows: string[][], columnNames: readonly string[]): TsvDocument {
  return {
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives: [],
    columns: columnNames.map((name) => ({ name, type: 'text', required: false })),
    rows,
  } as unknown as TsvDocument;
}

/** ケース側 `観点#` → 観点表 `観点#`。テストの既定のリンク。 */
const LINK: ColumnLink = {
  columnIndex: 2,
  path: '07_観点表.tsv',
  targetColumn: '観点#',
  separator: ',',
};

describe('readColumnLinks', () => {
  it('参照元の列・参照先のファイルと列を 1 本のリンクへ読む', () => {
    expect(readColumnLinks(['link 観点# -> 07_観点表.tsv#観点#'], CASE_COLUMNS)).toEqual([LINK]);
  });

  it('link 以外のディレクティブは無視する', () => {
    expect(
      readColumnLinks(['computed No. = rowNumber()', 'style 結果 OK=#cfc'], CASE_COLUMNS),
    ).toEqual([]);
  });

  it('列定義に無い列名を指す宣言は捨てる', () => {
    expect(readColumnLinks(['link 存在しない列 -> 07_観点表.tsv#観点#'], CASE_COLUMNS)).toEqual([]);
  });

  it('-> が無い行は捨てる', () => {
    expect(readColumnLinks(['link 観点# 07_観点表.tsv#観点#'], CASE_COLUMNS)).toEqual([]);
  });

  it('参照先に列の指定が無い行は捨てる（ファイルだけでは引けない）', () => {
    expect(readColumnLinks(['link 観点# -> 07_観点表.tsv'], CASE_COLUMNS)).toEqual([]);
  });

  it('参照先の列名に # を含められる（パス側の最初の # で切る）', () => {
    expect(readColumnLinks(['link 観点# -> 07_観点表.tsv#観点#'], CASE_COLUMNS)[0]?.targetColumn).toBe(
      '観点#',
    );
  });

  it('-> の前後の空白は詰める', () => {
    expect(readColumnLinks(['link 観点#->07_観点表.tsv#観点#'], CASE_COLUMNS)).toEqual([LINK]);
  });

  it('sep= で 1 セル内の区切り文字を変えられる', () => {
    expect(readColumnLinks(['link 観点# -> 07_観点表.tsv#観点# sep=;'], CASE_COLUMNS)).toEqual([
      { ...LINK, separator: ';' },
    ]);
  });

  it('未知のオプションは宣言ごと捨てる（黙って列名の一部にしない）', () => {
    expect(readColumnLinks(['link 観点# -> 07_観点表.tsv#観点# mode=strict'], CASE_COLUMNS)).toEqual(
      [],
    );
  });

  it('空の sep= は捨てる', () => {
    expect(readColumnLinks(['link 観点# -> 07_観点表.tsv#観点# sep='], CASE_COLUMNS)).toEqual([]);
  });

  it('Windows で書かれた ￥ 区切りのパスは / へ直す', () => {
    expect(readColumnLinks(['link 観点# -> sub\\07_観点表.tsv#観点#'], CASE_COLUMNS)[0]?.path).toBe(
      'sub/07_観点表.tsv',
    );
  });

  it('絶対パスは捨てる（共有した時点で壊れている）', () => {
    expect(readColumnLinks(['link 観点# -> C:/data/07_観点表.tsv#観点#'], CASE_COLUMNS)).toEqual([]);
    expect(readColumnLinks(['link 観点# -> /data/07_観点表.tsv#観点#'], CASE_COLUMNS)).toEqual([]);
  });

  it('tsv 以外を指す宣言は捨てる（列を引けない）', () => {
    expect(readColumnLinks(['link 観点# -> 07_観点表.md#観点#'], CASE_COLUMNS)).toEqual([]);
  });

  it('同じ列への重複宣言は後勝ちで 1 本に畳む', () => {
    expect(
      readColumnLinks(
        ['link 観点# -> 旧観点表.tsv#観点#', 'link 観点# -> 07_観点表.tsv#観点#'],
        CASE_COLUMNS,
      ),
    ).toEqual([LINK]);
  });
});

describe('splitLinkedValues', () => {
  it('区切り文字で分け、前後の空白を詰める', () => {
    expect(splitLinkedValues('OBS-1, OBS-2 ,OBS-3', ',')).toEqual(['OBS-1', 'OBS-2', 'OBS-3']);
  });

  it('空の要素は落とす', () => {
    expect(splitLinkedValues('OBS-1,,OBS-2,', ',')).toEqual(['OBS-1', 'OBS-2']);
  });

  it('同じ値の重複は 1 つに畳む（1 行を二重に数えない）', () => {
    expect(splitLinkedValues('OBS-1,OBS-1', ',')).toEqual(['OBS-1']);
  });

  it('空セルは空配列', () => {
    expect(splitLinkedValues('   ', ',')).toEqual([]);
  });

  it('宣言した区切り文字で分ける', () => {
    expect(splitLinkedValues('OBS-1;OBS-2', ';')).toEqual(['OBS-1', 'OBS-2']);
  });
});

describe('checkColumnLink', () => {
  const cases = docOf(
    [
      ['1', 'ログイン', 'OBS-1,OBS-2'],
      ['2', 'ログアウト', 'OBS-2'],
    ],
    CASE_COLUMNS,
  );
  const observations = docOf(
    [
      ['OBS-1', '正常系'],
      ['OBS-2', '異常系'],
    ],
    OBSERVATION_COLUMNS,
  );

  it('両方が揃っていれば何も出さない', () => {
    expect(checkColumnLink(cases, LINK, observations)).toEqual([]);
  });

  it('参照先を読めないときは警告 1 件だけ（開いていないだけのことがある）', () => {
    const issues = checkColumnLink(cases, LINK, null);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('link_target_missing');
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.row).toBe(-1);
    expect(issues[0]?.column).toBe(2);
  });

  it('参照先に列が無いときも警告（値の検査はしない）', () => {
    const issues = checkColumnLink(cases, LINK, docOf([['正常系']], ['観点']));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('link_target_column_missing');
    expect(issues[0]?.severity).toBe('warning');
  });

  it('参照先に無い値はタイポとして参照元の位置で出す', () => {
    const typo = docOf([['1', 'ログイン', 'OBS-9']], CASE_COLUMNS);

    const issues = checkColumnLink(typo, LINK, observations).filter(
      (issue) => issue.code === 'link_unknown_value',
    );

    expect(issues).toEqual([
      {
        code: 'link_unknown_value',
        severity: 'error',
        side: 'source',
        row: 0,
        column: 2,
        value: 'OBS-9',
        message: '参照先 07_観点表.tsv に「OBS-9」がありません',
      },
    ]);
  });

  it('多値のうち引けなかった値だけを出す', () => {
    const half = docOf([['1', 'ログイン', 'OBS-1,OBS-9']], CASE_COLUMNS);

    expect(
      checkColumnLink(half, LINK, observations)
        .filter((issue) => issue.code === 'link_unknown_value')
        .map((issue) => issue.value),
    ).toEqual(['OBS-9']);
  });

  it('どのケースからも参照されていない行は取りこぼしとして参照先の位置で出す', () => {
    const withOrphan = docOf(
      [
        ['OBS-1', '正常系'],
        ['OBS-2', '異常系'],
        ['OBS-3', '境界値'],
      ],
      OBSERVATION_COLUMNS,
    );

    const issues = checkColumnLink(cases, LINK, withOrphan).filter(
      (issue) => issue.code === 'link_unreferenced_row',
    );

    expect(issues).toEqual([
      {
        code: 'link_unreferenced_row',
        severity: 'warning',
        side: 'target',
        row: 2,
        column: 0,
        value: 'OBS-3',
        message: '「OBS-3」を参照している行がありません',
      },
    ]);
  });

  it('取りこぼしは警告に留める（観点を先に起こす途中で赤くしない）', () => {
    const issues = checkColumnLink(docOf([], CASE_COLUMNS), LINK, observations);

    expect(issues.every((issue) => issue.severity === 'warning')).toBe(true);
    expect(issues).toHaveLength(2);
  });

  it('参照元の空セルは検査しない（未入力は未入力のまま）', () => {
    const blank = docOf([['1', 'ログイン', '']], CASE_COLUMNS);

    expect(
      checkColumnLink(blank, LINK, observations).some((issue) => issue.side === 'source'),
    ).toBe(false);
  });

  it('参照先の空セルは取りこぼしに数えない', () => {
    const withBlank = docOf(
      [
        ['OBS-1', '正常系'],
        ['OBS-2', '異常系'],
        ['', '書きかけ'],
      ],
      OBSERVATION_COLUMNS,
    );

    expect(checkColumnLink(cases, LINK, withBlank)).toEqual([]);
  });

  it('末尾セルが省略された短い行でも落ちない', () => {
    const short = docOf([['1', 'ログイン']], CASE_COLUMNS);

    expect(checkColumnLink(short, LINK, observations).every((issue) => issue.side === 'target')).toBe(
      true,
    );
  });

  it('同じ列を指す自己参照は 1 段で閉じる（辿らないので循環しない）', () => {
    const selfLink: ColumnLink = { ...LINK, path: '同じファイル.tsv', targetColumn: '観点#' };

    expect(checkColumnLink(observations, { ...selfLink, columnIndex: 0 }, observations)).toEqual([]);
  });
});
