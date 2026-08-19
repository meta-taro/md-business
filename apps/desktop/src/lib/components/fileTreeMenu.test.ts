import { describe, it, expect } from 'vitest';
import {
  toAbsolutePath,
  menuActionsForKind,
  baseName,
  validateNewName,
  renamedPath,
  childPath,
} from './fileTreeMenu';

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
  it('ファイルは共有リンク・openForge・ファイル情報まで含む全項目を持つ', () => {
    expect(menuActionsForKind('file')).toEqual([
      'rename',
      'reveal',
      'copyName',
      'copyRelPath',
      'copyPath',
      'copyShareLink',
      'openForge',
      'fileInfo',
    ]);
  });

  it('フォルダは共有リンクと openForge を持たず、代わりに新規作成を先頭に持つ', () => {
    expect(menuActionsForKind('folder')).toEqual([
      'newTestSheet',
      'rename',
      'reveal',
      'copyName',
      'copyRelPath',
      'copyPath',
    ]);
  });

  it('ファイルには新規作成を出さない（作る先はフォルダで指す）', () => {
    expect(menuActionsForKind('file')).not.toContain('newTestSheet');
  });

  // 容量・行数・文字コード・SHA-256 はファイル 1 本を読んで測る値で、
  // フォルダに対しては意味が変わる（合計なのか代表値なのか）。出さない。
  it('フォルダにはファイル情報を出さない', () => {
    expect(menuActionsForKind('folder')).not.toContain('fileInfo');
  });
});

describe('baseName', () => {
  it('末尾の名前だけを返す', () => {
    expect(baseName('docs/検証/シート.tsv')).toBe('シート.tsv');
  });

  it('階層がなければそのまま返す', () => {
    expect(baseName('a.md')).toBe('a.md');
  });

  it('バックスラッシュ区切りでも末尾を取れる', () => {
    expect(baseName('docs\\a.md')).toBe('a.md');
  });

  it('末尾に区切りが付いていても名前を返す', () => {
    expect(baseName('docs/検証/')).toBe('検証');
  });

  it('空文字は空文字のまま', () => {
    expect(baseName('')).toBe('');
  });
});

describe('validateNewName', () => {
  it('通常の名前は通す', () => {
    expect(validateNewName('新しい名前.md', 'file')).toBeNull();
    expect(validateNewName('検証シート', 'folder')).toBeNull();
  });

  it('空・空白のみは empty', () => {
    expect(validateNewName('', 'file')).toBe('empty');
    expect(validateNewName('   ', 'folder')).toBe('empty');
  });

  it('区切り文字を含むと separator（移動には使わせない）', () => {
    expect(validateNewName('sub/a.md', 'file')).toBe('separator');
    expect(validateNewName('sub\\a.md', 'file')).toBe('separator');
  });

  it('. と .. は separator 扱いで拒否する', () => {
    expect(validateNewName('.', 'folder')).toBe('separator');
    expect(validateNewName('..', 'folder')).toBe('separator');
  });

  it('OS が受け付けない文字は invalidChar', () => {
    expect(validateNewName('a:b.md', 'file')).toBe('invalidChar');
    expect(validateNewName('a?b.md', 'file')).toBe('invalidChar');
    expect(validateNewName('a*b', 'folder')).toBe('invalidChar');
  });

  it('ファイルは md / tsv 以外の拡張子を拒否する（走査対象から外れるため）', () => {
    expect(validateNewName('a.txt', 'file')).toBe('extension');
    expect(validateNewName('拡張子なし', 'file')).toBe('extension');
  });

  it('ファイルの拡張子は大文字でも通す', () => {
    expect(validateNewName('A.MD', 'file')).toBeNull();
    expect(validateNewName('A.Tsv', 'file')).toBeNull();
  });

  it('フォルダは拡張子を問わない', () => {
    expect(validateNewName('2026.06 期', 'folder')).toBeNull();
  });
});

describe('renamedPath', () => {
  it('末尾の名前だけを差し替える', () => {
    expect(renamedPath('docs/検証/旧名.tsv', '新名.tsv')).toBe('docs/検証/新名.tsv');
  });

  it('直下なら新しい名前がそのまま相対パスになる', () => {
    expect(renamedPath('a.md', 'b.md')).toBe('b.md');
  });

  it('前後の空白は落として組み立てる', () => {
    expect(renamedPath('docs/a.md', '  b.md  ')).toBe('docs/b.md');
  });
});

describe('childPath', () => {
  it('フォルダの下に名前を繋ぐ', () => {
    expect(childPath('docs/検証', '001-login.tsv')).toBe('docs/検証/001-login.tsv');
  });

  it('ルート直下は名前だけになる（先頭に区切りを付けない）', () => {
    expect(childPath('', '001-login.tsv')).toBe('001-login.tsv');
  });

  it('区切り文字は走査と同じ "/" に揃える', () => {
    expect(childPath('docs\\検証', '001-login.tsv')).toBe('docs/検証/001-login.tsv');
  });

  it('前後の空白と余分な区切りは落とす', () => {
    expect(childPath('/docs//検証/', '  001-login.tsv  ')).toBe('docs/検証/001-login.tsv');
  });
});
