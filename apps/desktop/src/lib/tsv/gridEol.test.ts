import { describe, it, expect } from 'vitest';
import { preserveTrailingEol } from './gridEol';

describe('preserveTrailingEol', () => {
  it('元テキストが末尾改行を持つなら書き戻しにも付け直す', () => {
    expect(preserveTrailingEol('a\tb', 'a\tb\n')).toBe('a\tb\n');
  });

  it('元テキストが CRLF 終端でも改行 1 つを付け直す（本文は LF に揃える）', () => {
    expect(preserveTrailingEol('a\tb', 'a\tb\r\n')).toBe('a\tb\n');
  });

  it('元テキストに末尾改行が無ければ付けない（無い状態を正本として尊重する）', () => {
    expect(preserveTrailingEol('a\tb', 'a\tb')).toBe('a\tb');
  });

  it('既に末尾改行があれば二重に付けない', () => {
    expect(preserveTrailingEol('a\tb\n', 'a\tb\n')).toBe('a\tb\n');
  });

  it('元テキストが空なら付けない（新規作成直後に余計な行を生やさない）', () => {
    expect(preserveTrailingEol('a\tb', '')).toBe('a\tb');
  });

  it('書き戻しが空でも元に末尾改行があれば維持する', () => {
    expect(preserveTrailingEol('', 'a\tb\n')).toBe('\n');
  });
});
