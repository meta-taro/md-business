import { describe, expect, it } from 'vitest';
import { countReferences, parseCountInSource } from '../src/countIn.js';
import type { TsvDocument } from '../src/parse.js';

/**
 * 集計（`countIn(<ファイル>)`）。
 *
 * 最重要契約:
 * - **関係は 1 か所にしか書かない**。数える側は相手ファイルの名前だけを書き、
 *   どの列とどの列が対応するかは相手の `#@ link` から読む。
 * - **数えられないときは null**。値を 0 で埋めると「参照が無い」と区別がつかず、
 *   相手を開いていないだけで 0 がファイルへ焼かれる。
 * - **1 行は 1 件**。相手が 2 つの列でこちらを指していても、同じ行を二重に数えない。
 */

function docOf(
  columnNames: readonly string[],
  rows: string[][],
  directives: readonly string[] = [],
): TsvDocument {
  return {
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives: [...directives],
    columns: columnNames.map((name) => ({ name, type: 'text', required: false })),
    rows,
  } as unknown as TsvDocument;
}

/** 数えられる側（観点の一覧）。 */
function pointsSheet(rows: string[][] = [['K-1'], ['K-2'], ['K-3']]): TsvDocument {
  return docOf(['観点#'], rows);
}

/** 数える元（ケースの一覧）。観点を指すリンク定義を持つ。 */
function casesSheet(
  rows: string[][],
  directives: readonly string[] = ['link 観点# -> 観点表.tsv#観点#'],
): TsvDocument {
  return docOf(['No.', '観点#'], rows, directives);
}

describe('parseCountInSource', () => {
  it('数える相手のファイル名を読む', () => {
    expect(parseCountInSource('countIn(07_ケース.tsv)')).toBe('07_ケース.tsv');
  });

  it('括弧の内側の空白は詰める', () => {
    expect(parseCountInSource('countIn( ../一覧/ケース.tsv )')).toBe('../一覧/ケース.tsv');
  });

  it('Windows で入力した区切りも受ける', () => {
    // 書いた本人の環境でだけ動く形にしない。
    expect(parseCountInSource('countIn(..\\一覧\\ケース.tsv)')).toBe('../一覧/ケース.tsv');
  });

  it('列を引けない形式は受けない', () => {
    // 列が無いファイルは指せても数えられない。
    expect(parseCountInSource('countIn(ケース.md)')).toBeNull();
  });

  it('その PC でしか開けない書き方は受けない', () => {
    expect(parseCountInSource('countIn(/tmp/ケース.tsv)')).toBeNull();
    expect(parseCountInSource('countIn(C:/tmp/ケース.tsv)')).toBeNull();
  });

  it('相手を書いていない・別の式は受けない', () => {
    expect(parseCountInSource('countIn()')).toBeNull();
    expect(parseCountInSource('countIn(  )')).toBeNull();
    expect(parseCountInSource('rowNumber()')).toBeNull();
    expect(parseCountInSource('countIn(a.tsv')).toBeNull();
  });
});

describe('countReferences', () => {
  it('自分を指している行の数を行ごとに返す', () => {
    const counts = countReferences(
      pointsSheet(),
      '観点表.tsv',
      casesSheet([
        ['1', 'K-1'],
        ['2', 'K-1'],
        ['3', 'K-2'],
      ]),
      'ケース.tsv',
    );
    // K-1 は 2 件、K-2 は 1 件、K-3 は 0 件。
    expect(counts).toEqual([2, 1, 0]);
  });

  it('1 セルの多値をそれぞれ数える', () => {
    const counts = countReferences(
      pointsSheet(),
      '観点表.tsv',
      casesSheet([['1', 'K-1, K-3']]),
      'ケース.tsv',
    );
    expect(counts).toEqual([1, 0, 1]);
  });

  it('同じ行が同じ観点を 2 回書いていても 1 件', () => {
    const counts = countReferences(
      pointsSheet(),
      '観点表.tsv',
      casesSheet([['1', 'K-1,K-1']]),
      'ケース.tsv',
    );
    expect(counts).toEqual([1, 0, 0]);
  });

  it('宣言した区切りで切る', () => {
    const counts = countReferences(
      pointsSheet(),
      '観点表.tsv',
      casesSheet([['1', 'K-1;K-2']], ['link 観点# -> 観点表.tsv#観点# sep=;']),
      'ケース.tsv',
    );
    expect(counts).toEqual([1, 1, 0]);
  });

  it('鍵の値が空の行は数えない', () => {
    const counts = countReferences(
      pointsSheet([['K-1'], ['']]),
      '観点表.tsv',
      casesSheet([
        ['1', 'K-1'],
        ['2', ''],
      ]),
      'ケース.tsv',
    );
    expect(counts).toEqual([1, 0]);
  });

  it('相手が 2 つの列でこちらを指していても 1 行は 1 件', () => {
    // 同じケースが「主な観点」と「関連する観点」の両方に同じ値を書くことがある。
    // 足し合わせると、実際には 1 件のケースが 2 件に見える。
    const cases = docOf(
      ['No.', '主観点', '副観点'],
      [['1', 'K-1', 'K-1']],
      ['link 主観点 -> 観点表.tsv#観点#', 'link 副観点 -> 観点表.tsv#観点#'],
    );
    expect(countReferences(pointsSheet(), '観点表.tsv', cases, 'ケース.tsv')).toEqual([1, 0, 0]);
  });

  it('相手の宣言が指す列の値で数える', () => {
    const points = docOf(
      ['観点#', '名称'],
      [
        ['K-1', '入金'],
        ['K-2', '出金'],
      ],
    );
    const cases = casesSheet([['1', '入金']], ['link 観点# -> 観点表.tsv#名称']);
    expect(countReferences(points, '観点表.tsv', cases, 'ケース.tsv')).toEqual([1, 0]);
  });

  it('相手から見た相対の位置でこちらを見分ける', () => {
    const cases = casesSheet([['1', 'K-1']], ['link 観点# -> ../観点/観点表.tsv#観点#']);
    expect(
      countReferences(pointsSheet(), '観点/観点表.tsv', cases, 'ケース/ケース.tsv'),
    ).toEqual([1, 0, 0]);
  });

  it('こちらを指していない相手では数えない', () => {
    // 0 を返すと「参照が 1 件も無い」と区別がつかず、関係の書き忘れに気づけない。
    const cases = casesSheet([['1', 'K-1']], ['link 観点# -> ほかの表.tsv#観点#']);
    expect(countReferences(pointsSheet(), '観点表.tsv', cases, 'ケース.tsv')).toBeNull();
  });

  it('相手にリンク定義が無ければ数えない', () => {
    expect(countReferences(pointsSheet(), '観点表.tsv', casesSheet([['1', 'K-1']], []), 'ケース.tsv'))
      .toBeNull();
  });

  it('こちらに参照先の列が無ければ数えない', () => {
    const points = docOf(['名称'], [['入金']]);
    expect(countReferences(points, '観点表.tsv', casesSheet([['1', 'K-1']]), 'ケース.tsv')).toBeNull();
  });
});
