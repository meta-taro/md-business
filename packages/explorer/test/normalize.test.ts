import { describe, expect, it } from 'vitest';
import { normalizeForSearch, splitQuery } from '../src/normalize.js';

describe('normalizeForSearch', () => {
  it('全角英数と半角カナを揃え、小文字にする', () => {
    expect(normalizeForSearch('ＡＰＩ ｻｰﾊﾞ')).toBe('api さーば');
  });
  it('カタカナはひらがなに寄せる（どちらで打っても当たる）', () => {
    expect(normalizeForSearch('サーバ')).toBe(normalizeForSearch('さーば'));
  });
});

describe('splitQuery', () => {
  it('空白（全角含む）で語に分け、空の語は捨てる', () => {
    expect(splitQuery('  非常用　電源 ')).toEqual(['非常用', '電源']);
  });
  it('空なら空配列', () => {
    expect(splitQuery('   ')).toEqual([]);
  });
});
