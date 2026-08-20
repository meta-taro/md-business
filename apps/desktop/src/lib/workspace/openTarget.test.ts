import { describe, expect, it } from 'vitest';
import { ancestorFolders, chooseOpenRoot, resolveOpenTarget } from './openTarget';

describe('resolveOpenTarget', () => {
  it('いま開いているフォルダの中なら、ファイルを選ぶだけ', () => {
    const got = resolveOpenTarget('C:\\work\\docs\\a.tsv', 'C:\\work', []);
    expect(got).toEqual({ kind: 'select', relPath: 'docs/a.tsv' });
  });

  it('区切り文字が混ざっていても同じ扱いにする', () => {
    const got = resolveOpenTarget('C:/work/docs/a.tsv', 'C:\\work\\', []);
    expect(got).toEqual({ kind: 'select', relPath: 'docs/a.tsv' });
  });

  it('大文字小文字の違いは同じフォルダとみなす', () => {
    const got = resolveOpenTarget('c:\\Work\\docs\\a.tsv', 'C:\\work', []);
    expect(got).toEqual({ kind: 'select', relPath: 'docs/a.tsv' });
  });

  it('フォルダ名の途中まで一致しただけでは中とみなさない', () => {
    const got = resolveOpenTarget('C:\\work2\\a.tsv', 'C:\\work', []);
    expect(got).toEqual({ kind: 'unknown' });
  });

  it('開いていないが、以前に開いたフォルダの中なら、そのフォルダへ切り替える', () => {
    const got = resolveOpenTarget('C:\\repo\\docs\\a.tsv', 'C:\\work', ['C:\\repo', 'C:\\other']);
    expect(got).toEqual({ kind: 'switch', root: 'C:\\repo', relPath: 'docs/a.tsv' });
  });

  it('入れ子で当てはまるときは、より内側のフォルダを選ぶ', () => {
    const got = resolveOpenTarget('C:\\repo\\sub\\docs\\a.tsv', null, ['C:\\repo', 'C:\\repo\\sub']);
    expect(got).toEqual({ kind: 'switch', root: 'C:\\repo\\sub', relPath: 'docs/a.tsv' });
  });

  it('フォルダを開いていなくても、以前のフォルダから決められる', () => {
    const got = resolveOpenTarget('C:\\repo\\a.tsv', null, ['C:\\repo']);
    expect(got).toEqual({ kind: 'switch', root: 'C:\\repo', relPath: 'a.tsv' });
  });

  it('どこにも当てはまらなければ、決められないと返す', () => {
    expect(resolveOpenTarget('D:\\tmp\\a.tsv', 'C:\\work', ['C:\\repo'])).toEqual({
      kind: 'unknown',
    });
  });

  it('空のパスは扱わない', () => {
    expect(resolveOpenTarget('', 'C:\\work', [])).toEqual({ kind: 'unknown' });
  });

  it('フォルダそのものを指されても、中のファイルとは扱わない', () => {
    expect(resolveOpenTarget('C:\\work', 'C:\\work', [])).toEqual({ kind: 'unknown' });
  });
});

describe('ancestorFolders', () => {
  it('ファイルの親から上へ、近い順に返す', () => {
    expect(ancestorFolders('C:\\work\\repo\\docs\\a.tsv')).toEqual([
      'C:/work/repo/docs',
      'C:/work/repo',
      'C:/work',
      'C:',
    ]);
  });

  it('区切り文字が混ざっていても同じ並びになる', () => {
    expect(ancestorFolders('C:/work/a.tsv')).toEqual(['C:/work', 'C:']);
  });

  it('ドライブ直下のファイルは、そのドライブだけ', () => {
    expect(ancestorFolders('C:\\a.tsv')).toEqual(['C:']);
  });

  it('POSIX の絶対パスは根まで辿る', () => {
    expect(ancestorFolders('/home/u/repo/a.tsv')).toEqual(['/home/u/repo', '/home/u', '/home', '/']);
  });

  it('親のないものは何も返さない', () => {
    expect(ancestorFolders('')).toEqual([]);
    expect(ancestorFolders('a.tsv')).toEqual([]);
  });
});

describe('chooseOpenRoot', () => {
  it('いちばん近い .git のあるフォルダを起点にする', () => {
    const hasGit = (folder: string): boolean => folder === 'C:/work/repo';
    expect(chooseOpenRoot('C:\\work\\repo\\docs\\a.tsv', hasGit)).toBe('C:/work/repo');
  });

  it('入れ子なら内側を起点にする', () => {
    const hasGit = (folder: string): boolean =>
      folder === 'C:/work/repo' || folder === 'C:/work/repo/sub';
    expect(chooseOpenRoot('C:\\work\\repo\\sub\\docs\\a.tsv', hasGit)).toBe('C:/work/repo/sub');
  });

  it('.git が無ければファイルの親を起点にする', () => {
    expect(chooseOpenRoot('C:\\work\\repo\\docs\\a.tsv', () => false)).toBe('C:/work/repo/docs');
  });

  it('ドライブ直下は起点にしない（丸ごと走査させない）', () => {
    expect(chooseOpenRoot('C:\\a.tsv', () => false)).toBeNull();
    expect(chooseOpenRoot('/a.tsv', () => false)).toBeNull();
  });

  it('親が無ければ決められない', () => {
    expect(chooseOpenRoot('a.tsv', () => false)).toBeNull();
  });
});
