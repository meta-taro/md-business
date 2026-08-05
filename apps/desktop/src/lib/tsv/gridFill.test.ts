import { describe, it, expect } from 'vitest';
import type { TsvDocument } from '@md-business/schema-test-spec-tsv';
import { fillDown } from './gridFill';

/**
 * 選択範囲を下方向へ埋める（Ctrl+D）純ロジックの検査。
 *
 * 検証シートは実施のたびに `結果` `実施日` `担当` を同じ値で何十行も埋める。
 * 列ごとの専用機能ではなく、表計算と同じ「下へ埋める」1 本で足りる。
 */

function doc(rows: string[][]): TsvDocument {
  return {
    columns: [
      { name: 'No.', type: 'number', required: false },
      { name: '結果', type: 'enum', required: false, enumValues: ['OK', 'NG'] },
      { name: '担当', type: 'text', required: false },
    ],
    rows,
    directives: [],
  } as unknown as TsvDocument;
}

describe('fillDown', () => {
  it('複数行の範囲は、先頭行の値を以降の行へ配る', () => {
    const before = doc([
      ['1', 'OK', ''],
      ['2', '', ''],
      ['3', 'NG', ''],
    ]);
    const after = fillDown(before, { r0: 0, c0: 1, r1: 2, c1: 1 });
    expect(after.rows).toEqual([
      ['1', 'OK', ''],
      ['2', 'OK', ''],
      ['3', 'OK', ''],
    ]);
  });

  it('列は別々に埋める（範囲が複数列でも混ざらない）', () => {
    const before = doc([
      ['1', 'OK', '田中'],
      ['2', '', ''],
      ['3', '', ''],
    ]);
    const after = fillDown(before, { r0: 0, c0: 1, r1: 2, c1: 2 });
    expect(after.rows).toEqual([
      ['1', 'OK', '田中'],
      ['2', 'OK', '田中'],
      ['3', 'OK', '田中'],
    ]);
  });

  it('空の値でも配る（消す方向にも使える）', () => {
    const before = doc([
      ['1', '', ''],
      ['2', 'NG', ''],
    ]);
    const after = fillDown(before, { r0: 0, c0: 1, r1: 1, c1: 1 });
    expect(after.rows[1]?.[1]).toBe('');
  });

  it('単一セルの選択は、直上のセルから引く', () => {
    const before = doc([
      ['1', 'OK', ''],
      ['2', '', ''],
    ]);
    const after = fillDown(before, { r0: 1, c0: 1, r1: 1, c1: 1 });
    expect(after.rows[1]?.[1]).toBe('OK');
  });

  it('先頭行の単一セルは引く先が無いので何もしない', () => {
    const before = doc([['1', 'OK', '']]);
    expect(fillDown(before, { r0: 0, c0: 1, r1: 0, c1: 1 })).toBe(before);
  });

  it('値が変わらないなら同じ参照を返す（履歴を汚さない）', () => {
    const before = doc([
      ['1', 'OK', ''],
      ['2', 'OK', ''],
    ]);
    expect(fillDown(before, { r0: 0, c0: 1, r1: 1, c1: 1 })).toBe(before);
  });

  it('触らない行は同じ参照のまま', () => {
    const before = doc([
      ['1', 'OK', ''],
      ['2', '', ''],
      ['3', 'NG', ''],
    ]);
    const after = fillDown(before, { r0: 0, c0: 1, r1: 1, c1: 1 });
    expect(after.rows[2]).toBe(before.rows[2]);
  });

  it('末尾セルが省略された短い行にも書ける（空で埋めてから設定）', () => {
    const before = doc([['1', 'OK', '田中'], ['2']]);
    const after = fillDown(before, { r0: 0, c0: 2, r1: 1, c1: 2 });
    expect(after.rows[1]).toEqual(['2', '', '田中']);
  });

  it('短い行へ空を配っても列を増やさない（中身の変わらない差分を出さない）', () => {
    const before = doc([['1', '', ''], ['2']]);
    expect(fillDown(before, { r0: 0, c0: 2, r1: 1, c1: 2 })).toBe(before);
  });

  it('実データより下（パッド行）へは書かない', () => {
    const before = doc([
      ['1', 'OK', ''],
      ['2', '', ''],
    ]);
    const after = fillDown(before, { r0: 0, c0: 1, r1: 5, c1: 1 });
    expect(after.rows).toHaveLength(2);
    expect(after.rows[1]?.[1]).toBe('OK');
  });

  it('範囲がまるごとパッド行なら何もしない', () => {
    const before = doc([['1', 'OK', '']]);
    expect(fillDown(before, { r0: 3, c0: 1, r1: 5, c1: 1 })).toBe(before);
  });

  it('行 ID を載せた doc をそのまま通せる（行数は変えない）', () => {
    const before = {
      ...doc([
        ['1', 'OK', ''],
        ['2', '', ''],
      ]),
      rowIds: ['raaaaaaaaaaaa', 'rbbbbbbbbbbbb'],
    };
    const after = fillDown(before, { r0: 0, c0: 1, r1: 1, c1: 1 });
    expect(after.rowIds).toEqual(['raaaaaaaaaaaa', 'rbbbbbbbbbbbb']);
  });
});
