import { describe, it, expect } from 'vitest';
import { unlikeRowIds, unmatchedRowIds } from './gridFilter';
import { buildSearchRegex } from '../search/searchLogic';
import { parseTsv, withRowIds, ROW_ID_COLUMN } from '@md-business/schema-test-spec-tsv';

const A = 'raaaaaaaaaaaa';
const B = 'rbbbbbbbbbbbb';
const C = 'rcccccccccccc';

const doc = withRowIds(
  parseTsv(
    [
      '#! md-business:test-spec-tsv/v1',
      `#@ rowid ${ROW_ID_COLUMN}`,
      `項目\t結果\t${ROW_ID_COLUMN}`,
      `ログインできる\tNG\t${A}`,
      `ログアウトできる\tOK\t${B}`,
      `パスワードを変える\t NG \t${C}`,
    ].join('\n'),
  ),
);

/** 検索窓と同じ組み立てで正規表現を作る（当たり方を 2 通り持たないため）。 */
function regex(text: string): RegExp | null {
  return buildSearchRegex(text, { caseSensitive: false, wholeWord: false, regex: false });
}

describe('unmatchedRowIds — 言葉に当たらない行', () => {
  it('どのセルにも当たらない行だけを返す', () => {
    expect([...unmatchedRowIds(doc, regex('ログ'))]).toEqual([C]);
  });

  it('列をまたいで当たれば残す', () => {
    expect([...unmatchedRowIds(doc, regex('NG'))]).toEqual([B]);
  });

  it('探す言葉が無ければ何も外さない', () => {
    expect([...unmatchedRowIds(doc, regex(''))]).toEqual([]);
  });

  it('どの行にも当たらなければ全行を返す', () => {
    // 空の表になるが、外した件数は出しているので解除できる。当たらなかったことを
    // 黙って無かったことにすると、押しても何も起きない機能に見える。
    expect([...unmatchedRowIds(doc, regex('該当なし'))]).toEqual([A, B, C]);
  });
});

describe('unlikeRowIds — いまのセルと違う値の行', () => {
  it('同じ列で値が違う行を返す', () => {
    expect([...unlikeRowIds(doc, 1, 'NG')]).toEqual([B]);
  });

  it('前後の空白は無視して比べる（表計算を通ると付く）', () => {
    // C の `結果` は ` NG `。見た目が同じものを別扱いにすると、絞った表から抜け落ちる。
    expect([...unlikeRowIds(doc, 1, ' NG')]).toEqual([B]);
  });

  it('空の値でも絞れる（まだ結果を入れていない行を集める）', () => {
    const blank = withRowIds(
      parseTsv(
        [
          '#! md-business:test-spec-tsv/v1',
          `#@ rowid ${ROW_ID_COLUMN}`,
          `項目\t結果\t${ROW_ID_COLUMN}`,
          `ログイン\tOK\t${A}`,
          `ログアウト\t\t${B}`,
        ].join('\n'),
      ),
    );

    expect([...unlikeRowIds(blank, 1, '')]).toEqual([A]);
  });

  it('宣言されていない列は絞らない', () => {
    expect([...unlikeRowIds(doc, 9, 'NG')]).toEqual([]);
  });
});
