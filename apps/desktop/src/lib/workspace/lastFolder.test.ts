import { describe, it, expect } from 'vitest';
import { parseStoredFolder, decideRestore } from './lastFolder';

describe('parseStoredFolder', () => {
  it('有効なパス文字列はそのまま復元候補になる', () => {
    expect(parseStoredFolder('C:/work/docs')).toBe('C:/work/docs');
  });

  it('未保存（null）は復元しない', () => {
    expect(parseStoredFolder(null)).toBe(null);
  });

  it('空文字・空白のみは復元しない', () => {
    expect(parseStoredFolder('')).toBe(null);
    expect(parseStoredFolder('   ')).toBe(null);
  });

  it('前後の空白は除去する', () => {
    expect(parseStoredFolder('  C:/work/docs  ')).toBe('C:/work/docs');
  });
});

describe('decideRestore', () => {
  it('記憶が無ければ何も開かない', () => {
    expect(decideRestore(null, null)).toEqual({ kind: 'none' });
    expect(decideRestore('   ', null)).toEqual({ kind: 'none' });
  });

  it('前回が最後まで進んでいれば復元する', () => {
    expect(decideRestore('C:/work/docs', null)).toEqual({
      kind: 'restore',
      path: 'C:/work/docs',
    });
  });

  it('同じフォルダの読み込み途中で終わっていたら開かない', () => {
    expect(decideRestore('Y:/share', 'Y:/share')).toEqual({ kind: 'skip', path: 'Y:/share' });
  });

  it('途中で終わった印が別のフォルダなら復元する', () => {
    expect(decideRestore('C:/work/docs', 'Y:/share')).toEqual({
      kind: 'restore',
      path: 'C:/work/docs',
    });
  });

  it('印の前後の空白は同じフォルダとみなす', () => {
    expect(decideRestore('Y:/share', '  Y:/share  ')).toEqual({ kind: 'skip', path: 'Y:/share' });
  });

  it('印だけ残っていて記憶が無ければ何も開かない', () => {
    expect(decideRestore(null, 'Y:/share')).toEqual({ kind: 'none' });
  });
});
