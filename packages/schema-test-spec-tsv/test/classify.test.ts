import { describe, it, expect } from 'vitest';
import { classifyLine } from '../src/classify.js';

/**
 * カスタム TSV の各物理行は、先頭マーカーで種類が決まる（Issue 010）。
 *
 * | 先頭 | 種類 | 意味 |
 * |------|------|------|
 * | `#!` | magic | フォーマット識別行（1 行目） |
 * | `#@` | directive | 構造メタ（条件付き書式など） |
 * | `#`  | meta | 文書メタ（キー: 値・人間可読） |
 * | （他）| data | 型付きヘッダ行 or データ行 |
 * | 空白のみ | blank | 空行（Excel コピペの末尾改行など・パーサが読み飛ばす） |
 *
 * マーカーは **必ず行頭（列 0）** にある場合のみ有効。先頭に空白があるセルは
 * ただのデータ行として扱う（Excel/Sheets のコメント判定と同じ挙動）。
 */
describe('classifyLine', () => {
  it('classifies a #! line as magic', () => {
    expect(classifyLine('#! md-business:test-spec-tsv/v1')).toBe('magic');
  });

  it('classifies a bare #! as magic', () => {
    expect(classifyLine('#!')).toBe('magic');
  });

  it('classifies a #@ line as directive', () => {
    expect(classifyLine('#@ style 結果 〇=#e6f4ea')).toBe('directive');
  });

  it('classifies a bare #@ as directive', () => {
    expect(classifyLine('#@')).toBe('directive');
  });

  it('classifies a # line as meta', () => {
    expect(classifyLine('#  文書番号: TEST-2026-0002')).toBe('meta');
  });

  it('classifies a bare # as meta', () => {
    expect(classifyLine('#')).toBe('meta');
  });

  it('classifies ## as meta (second char is neither ! nor @)', () => {
    expect(classifyLine('##')).toBe('meta');
  });

  it('classifies a typed header row as data', () => {
    expect(classifyLine('項目\t手順:multiline\t結果:enum(〇|×)')).toBe('data');
  });

  it('classifies a normal data row as data', () => {
    expect(classifyLine('新規受注登録\t顧客を入力\t〇')).toBe('data');
  });

  it('classifies an empty string as blank', () => {
    expect(classifyLine('')).toBe('blank');
  });

  it('classifies a spaces-only line as blank', () => {
    expect(classifyLine('   ')).toBe('blank');
  });

  it('classifies a tabs-only line (empty cells) as blank', () => {
    expect(classifyLine('\t\t')).toBe('blank');
  });

  it('classifies a mixed spaces-and-tabs line as blank', () => {
    expect(classifyLine(' \t \t')).toBe('blank');
  });

  it('treats a marker not at column 0 as data (leading space before #)', () => {
    expect(classifyLine(' #これはコメントではない')).toBe('data');
  });

  it('treats a leading-tab #@ as data (marker must be at column 0)', () => {
    expect(classifyLine('\t#@ style')).toBe('data');
  });
});
