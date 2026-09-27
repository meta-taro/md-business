import { describe, it, expect } from 'vitest';
import { excludedByConditions, matchesCondition, type ColumnCondition } from './gridColumnFilter';
import { parseTsv, withRowIds, ROW_ID_COLUMN } from '@md-business/schema-test-spec-tsv';

const A = 'raaaaaaaaaaaa';
const B = 'rbbbbbbbbbbbb';
const C = 'rcccccccccccc';

const doc = withRowIds(
  parseTsv(
    [
      '#! md-business:test-spec-tsv/v1',
      `#@ rowid ${ROW_ID_COLUMN}`,
      `項目\t結果\t工数\t${ROW_ID_COLUMN}`,
      `ログインできる\tNG\t3\t${A}`,
      `ログアウトできる\tOK\t12\t${B}`,
      `パスワードを変える\t\t\t${C}`,
    ].join('\n'),
  ),
);

describe('matchesCondition — 値の一覧から選ぶ', () => {
  const cond: ColumnCondition = { kind: 'values', values: ['NG', ''] };
  it('選んだ値に当たる（前後の空白は見ない）', () => expect(matchesCondition(' NG ', cond)).toBe(true));
  it('空欄も選べる', () => expect(matchesCondition('', cond)).toBe(true));
  it('選んでいない値は外れる', () => expect(matchesCondition('OK', cond)).toBe(false));
});

describe('matchesCondition — 文字を含む', () => {
  const cond: ColumnCondition = { kind: 'text', text: 'login' };
  it('大文字小文字を区別せず部分一致で当たる', () => expect(matchesCondition('Can LOGIN', cond)).toBe(true));
  it('含まなければ外れる', () => expect(matchesCondition('logout', cond)).toBe(false));
  it('空の言葉は何にでも当たる', () => expect(matchesCondition('x', { kind: 'text', text: ' ' })).toBe(true));
});

describe('matchesCondition — 範囲', () => {
  it('数は数として比べる（下限・上限を含む）', () => {
    const cond: ColumnCondition = { kind: 'range', type: 'number', min: '9', max: '100' };
    expect(matchesCondition('10', cond)).toBe(true);
    expect(matchesCondition('9', cond)).toBe(true);
    expect(matchesCondition('100', cond)).toBe(true);
    expect(matchesCondition('1,000', cond)).toBe(false);
    expect(matchesCondition('8', cond)).toBe(false);
  });

  it('片側だけでも絞れる', () => {
    expect(matchesCondition('5', { kind: 'range', type: 'number', min: '3', max: '' })).toBe(true);
    expect(matchesCondition('2', { kind: 'range', type: 'number', min: '3', max: '' })).toBe(false);
  });

  it('空欄と数でない値は範囲に入らない', () => {
    const cond: ColumnCondition = { kind: 'range', type: 'number', min: '', max: '10' };
    expect(matchesCondition('', cond)).toBe(false);
    expect(matchesCondition('abc', cond)).toBe(false);
  });

  it('日付は書き方の揺れを吸収して日単位で比べる', () => {
    const cond: ColumnCondition = { kind: 'range', type: 'date', min: '2026/9/1', max: '2026-09-30' };
    expect(matchesCondition('2026/09/30 18:00', cond)).toBe(true);
    expect(matchesCondition('2026-9-1', cond)).toBe(true);
    expect(matchesCondition('2026/10/1', cond)).toBe(false);
  });
});

describe('excludedByConditions — 列ごとの条件を AND でつなぐ', () => {
  it('条件が無ければ何も外さない', () => {
    expect([...excludedByConditions(doc, new Map())]).toEqual([]);
  });

  it('どれか 1 つでも外れた行を外す', () => {
    const conditions = new Map<number, ColumnCondition>([
      [0, { kind: 'text', text: 'ログ' }],
      [1, { kind: 'values', values: ['OK'] }],
    ]);
    expect([...excludedByConditions(doc, conditions)]).toEqual([A, C]);
  });

  it('範囲の列でも外す', () => {
    const conditions = new Map<number, ColumnCondition>([
      [2, { kind: 'range', type: 'number', min: '10', max: '' }],
    ]);
    expect([...excludedByConditions(doc, conditions)]).toEqual([A, C]);
  });
});
