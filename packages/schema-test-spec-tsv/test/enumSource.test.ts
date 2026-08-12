import { describe, expect, it } from 'vitest';
import { collectEnumChoices, parseEnumSource } from '../src/enumSource.js';
import { parseTsv } from '../src/parse.js';

describe('parseEnumSource', () => {
  it('参照先をファイルと列名に分ける', () => {
    expect(parseEnumSource('-> 提出物.tsv#種別')).toEqual({
      path: '提出物.tsv',
      column: '種別',
    });
  });

  it('矢印の前後の空白は無くてもよい', () => {
    expect(parseEnumSource('->../共通/提出物.tsv#種別')).toEqual({
      path: '../共通/提出物.tsv',
      column: '種別',
    });
  });

  it('列名に # を含められる', () => {
    // 最初の # で切る。`観点#` のような列名が実在する。
    expect(parseEnumSource('-> 観点.tsv#観点#')).toEqual({
      path: '観点.tsv',
      column: '観点#',
    });
  });

  it('選択肢を並べた普通の記法は参照先ではない', () => {
    expect(parseEnumSource('OK|NG|保留')).toBeNull();
  });

  it('ファイル名か列名が欠けていれば参照先として読まない', () => {
    expect(parseEnumSource('-> 提出物.tsv')).toBeNull();
    expect(parseEnumSource('-> #種別')).toBeNull();
    expect(parseEnumSource('-> 提出物.tsv#')).toBeNull();
  });

  it('.tsv でないファイルは参照先として読まない', () => {
    expect(parseEnumSource('-> 提出物.md#種別')).toBeNull();
  });
});

describe('collectEnumChoices', () => {
  const SHEET =
    ['種別\t備考', '仕様書\t', '議事録\t', '仕様書\t重複', '\t空は選択肢にしない'].join('\n') + '\n';

  it('参照先の列の値を出てきた順に集める', () => {
    expect(collectEnumChoices(parseTsv(SHEET), '種別')).toEqual(['仕様書', '議事録']);
  });

  it('参照先に無い列を指していれば引けない', () => {
    // 空配列を返すと「選択肢が 0 個」と区別がつかず、既存の値が一斉に不正になる。
    expect(collectEnumChoices(parseTsv(SHEET), '分類')).toBeNull();
  });

  it('値が 1 件も無い列は空の選択肢として引ける', () => {
    const empty = ['種別\t備考', '\tあ'].join('\n') + '\n';
    expect(collectEnumChoices(parseTsv(empty), '種別')).toEqual([]);
  });
});
