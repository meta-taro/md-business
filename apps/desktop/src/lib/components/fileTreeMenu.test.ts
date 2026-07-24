import { describe, it, expect } from 'vitest';
import { toAbsolutePath, menuActionsForKind } from './fileTreeMenu';

describe('toAbsolutePath', () => {
  it('Windows ルートは区切りをバックスラッシュで連結する', () => {
    expect(toAbsolutePath('C:\\work\\docs', 'specs/api.md')).toBe('C:\\work\\docs\\specs\\api.md');
  });

  it('POSIX ルートは区切りをスラッシュで連結する', () => {
    expect(toAbsolutePath('/home/u/docs', 'specs/api.md')).toBe('/home/u/docs/specs/api.md');
  });

  it('相対パス先頭の区切り・重複区切りは畳む', () => {
    expect(toAbsolutePath('/root', '/a//b/c.tsv')).toBe('/root/a/b/c.tsv');
  });

  it('混在した区切りはルートの区切りへ寄せる', () => {
    expect(toAbsolutePath('C:\\r', 'a/b\\c.md')).toBe('C:\\r\\a\\b\\c.md');
  });

  it('ルート末尾の区切りは重複させない', () => {
    expect(toAbsolutePath('/root/', 'a.md')).toBe('/root/a.md');
  });

  it('相対パスが空ならルートをそのまま返す', () => {
    expect(toAbsolutePath('/root', '')).toBe('/root');
  });
});

describe('menuActionsForKind', () => {
  it('ファイルは reveal / copyPath / openForge を持つ', () => {
    expect(menuActionsForKind('file')).toEqual(['reveal', 'copyPath', 'openForge']);
  });

  it('フォルダは reveal / copyPath のみ（フォージ blob はファイル向け）', () => {
    expect(menuActionsForKind('folder')).toEqual(['reveal', 'copyPath']);
  });
});
