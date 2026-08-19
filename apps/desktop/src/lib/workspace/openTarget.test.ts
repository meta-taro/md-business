import { describe, expect, it } from 'vitest';
import { resolveOpenTarget } from './openTarget';

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
