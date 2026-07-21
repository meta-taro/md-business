import { describe, it, expect } from 'vitest';
import { buildTree, toDocEntry, type DocEntry } from './fileTree';

const entry = (relPath: string): DocEntry => toDocEntry(relPath);

describe('toDocEntry', () => {
  it('末尾セグメントを name、拡張子小文字を ext にする', () => {
    expect(toDocEntry('docs/sub/A.MD')).toEqual({
      relPath: 'docs/sub/A.MD',
      name: 'A.MD',
      ext: 'md',
    });
  });

  it('バックスラッシュ区切り・先頭スラッシュを正規化する', () => {
    expect(toDocEntry('\\docs\\a.tsv')).toEqual({
      relPath: 'docs/a.tsv',
      name: 'a.tsv',
      ext: 'tsv',
    });
  });

  it('拡張子なし・ドット始まりは ext を空にする', () => {
    expect(toDocEntry('README').ext).toBe('');
    expect(toDocEntry('.gitignore').ext).toBe('');
  });
});

describe('buildTree', () => {
  it('空配列は空の森を返す', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('ルート直下の単一ファイルを file ノードにする', () => {
    const tree = buildTree([entry('a.md')]);
    expect(tree).toEqual([
      { name: 'a.md', path: 'a.md', kind: 'file', ext: 'md', children: [] },
    ]);
  });

  it('中間フォルダを自動生成し入れ子にする', () => {
    const tree = buildTree([entry('docs/sub/c.tsv')]);
    expect(tree).toHaveLength(1);
    const docs = tree[0];
    expect(docs).toMatchObject({ name: 'docs', path: 'docs', kind: 'folder' });
    const sub = docs.children[0];
    expect(sub).toMatchObject({ name: 'sub', path: 'docs/sub', kind: 'folder' });
    expect(sub.children[0]).toEqual({
      name: 'c.tsv',
      path: 'docs/sub/c.tsv',
      kind: 'file',
      ext: 'tsv',
      children: [],
    });
  });

  it('同一フォルダ配下の複数ファイルは 1 つのフォルダに集約する', () => {
    const tree = buildTree([entry('docs/b.md'), entry('docs/a.md')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('docs');
    const names = tree[0].children.map((n) => n.name);
    expect(names).toEqual(['a.md', 'b.md']); // 名前昇順
  });

  it('フォルダ先行 → 名前昇順でソートする', () => {
    const tree = buildTree([
      entry('z.md'),
      entry('a.md'),
      entry('docs/x.md'),
      entry('alpha/y.md'),
    ]);
    // フォルダ(alpha, docs)先行 → ファイル(a.md, z.md)
    expect(tree.map((n) => `${n.kind}:${n.name}`)).toEqual([
      'folder:alpha',
      'folder:docs',
      'file:a.md',
      'file:z.md',
    ]);
  });

  it('重複する相対パスは 1 ノードに集約する（先勝ち）', () => {
    const tree = buildTree([entry('docs/a.md'), entry('docs/a.md')]);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].path).toBe('docs/a.md');
  });

  it('バックスラッシュ・先頭スラッシュ混在でも同じフォルダに寄せる', () => {
    const tree = buildTree([entry('docs/a.md'), entry('\\docs\\b.md')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe('docs');
    expect(tree[0].children.map((n) => n.path)).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('深い階層でも各フォルダ path が親からの累積になる', () => {
    const tree = buildTree([entry('a/b/c/d.md')]);
    const a = tree[0];
    const b = a.children[0];
    const c = b.children[0];
    expect([a.path, b.path, c.path]).toEqual(['a', 'a/b', 'a/b/c']);
    expect(c.children[0].path).toBe('a/b/c/d.md');
  });
});
