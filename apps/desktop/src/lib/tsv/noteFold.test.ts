import { describe, expect, it } from 'vitest';
import {
  NOTE_FOLD_MIN,
  foldsByDefault,
  noteFoldKey,
  noteFoldValue,
  resolveNoteFold,
} from './noteFold';

describe('foldsByDefault', () => {
  it('少ないうちは畳まない', () => {
    expect(foldsByDefault(0)).toBe(false);
    expect(foldsByDefault(3)).toBe(false);
  });

  it('境目から畳む', () => {
    expect(foldsByDefault(NOTE_FOLD_MIN)).toBe(true);
    expect(foldsByDefault(NOTE_FOLD_MIN + 5)).toBe(true);
  });
});

describe('resolveNoteFold', () => {
  it('覚えていなければ本数で決める', () => {
    expect(resolveNoteFold(2, null)).toBe(false);
    expect(resolveNoteFold(8, null)).toBe(true);
  });

  it('覚えた選択が本数より優先される', () => {
    expect(resolveNoteFold(8, 'open')).toBe(false);
    expect(resolveNoteFold(1, 'folded')).toBe(true);
  });

  it('読めない値は覚えていない扱い', () => {
    expect(resolveNoteFold(8, '')).toBe(true);
    expect(resolveNoteFold(1, 'yes')).toBe(false);
  });
});

describe('覚える先', () => {
  it('シートごとに分かれる', () => {
    expect(noteFoldKey('docs/test-specs/001-a.tsv')).not.toBe(
      noteFoldKey('docs/test-specs/002-b.tsv'),
    );
  });

  it('綴りは往復する', () => {
    expect(resolveNoteFold(0, noteFoldValue(true))).toBe(true);
    expect(resolveNoteFold(9, noteFoldValue(false))).toBe(false);
  });
});
