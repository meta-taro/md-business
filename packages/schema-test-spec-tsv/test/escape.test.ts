import { describe, it, expect } from 'vitest';
import { escapeCell, unescapeCell } from '../src/escape.js';

/**
 * カスタム TSV の核心制約は「1 レコード = 1 物理行」（Issue 010 §設計上の最重要制約）。
 * セル内のタブ・改行・復帰・バックスラッシュをバックスラッシュ表記へ畳み込むことで、
 * どんなセル値でも 1 物理行に収まり、git diff が行単位でクリーンに保たれる。
 */
describe('escapeCell', () => {
  it('escapes a literal tab (U+0009) to backslash-t', () => {
    expect(escapeCell('a\tb')).toBe('a\\tb');
  });

  it('escapes a literal LF (U+000A) to backslash-n', () => {
    expect(escapeCell('line1\nline2')).toBe('line1\\nline2');
  });

  it('escapes a literal CR (U+000D) to backslash-r', () => {
    expect(escapeCell('a\rb')).toBe('a\\rb');
  });

  it('escapes a backslash to double-backslash (and does so first, before token chars)', () => {
    // 生の "\" 1 文字 → "\\"（2 文字）
    expect(escapeCell('a\\b')).toBe('a\\\\b');
    // 生の "\" の直後に "t"（タブではない）→ "\\t"（3 文字: \ \ t）
    expect(escapeCell('a\\tb')).toBe('a\\\\tb');
  });

  it('leaves ordinary characters — including 日本語 and the pipe "|" — untouched', () => {
    expect(escapeCell('結果|〇|▲|×')).toBe('結果|〇|▲|×');
  });

  it('returns an empty string unchanged (空セルは空のまま)', () => {
    expect(escapeCell('')).toBe('');
  });

  it('escapes a CRLF pair to backslash-r backslash-n', () => {
    expect(escapeCell('a\r\nb')).toBe('a\\r\\nb');
  });
});

describe('unescapeCell', () => {
  it('restores backslash-t to a literal tab', () => {
    expect(unescapeCell('a\\tb')).toBe('a\tb');
  });

  it('restores backslash-n to a literal LF', () => {
    expect(unescapeCell('line1\\nline2')).toBe('line1\nline2');
  });

  it('restores backslash-r to a literal CR', () => {
    expect(unescapeCell('a\\rb')).toBe('a\rb');
  });

  it('restores double-backslash to a single backslash', () => {
    expect(unescapeCell('a\\\\b')).toBe('a\\b');
  });

  it('single-pass: escaped backslash followed by a literal t stays "\\t", not a tab', () => {
    // "\\t"（3 文字: \ \ t）→ "\t"（2 文字: \ t）であってタブではない
    expect(unescapeCell('a\\\\tb')).toBe('a\\tb');
  });

  it('keeps a trailing lone backslash literal (no following char to consume)', () => {
    expect(unescapeCell('a\\')).toBe('a\\');
  });

  it('keeps an unknown escape (\\x) literal — backslash plus the char', () => {
    expect(unescapeCell('a\\xb')).toBe('a\\xb');
  });

  it('returns an empty string unchanged', () => {
    expect(unescapeCell('')).toBe('');
  });
});

describe('round-trip: unescapeCell(escapeCell(x)) === x', () => {
  const samples = [
    '',
    'plain',
    'tab\there',
    'lf\nhere',
    'cr\rhere',
    'crlf\r\nhere',
    'back\\slash',
    'back\\\\double',
    'mixed\t改行\nと\\と|全部',
    '結果|〇|▲|×|保留|未実施',
    '「在庫不足: 残 5 個」\nエラーで確定不可',
  ];

  for (const s of samples) {
    it(`round-trips ${JSON.stringify(s)}`, () => {
      expect(unescapeCell(escapeCell(s))).toBe(s);
    });
  }
});
