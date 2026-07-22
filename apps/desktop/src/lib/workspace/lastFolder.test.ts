import { describe, it, expect } from 'vitest';
import { parseStoredFolder } from './lastFolder';

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
