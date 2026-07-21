import { describe, it, expect } from 'vitest';
import { buildTree, toDocEntry, type DocEntry } from './fileTree';
import {
  initialExpandedPaths,
  toggleExpanded,
  flattenVisible,
  type VisibleRow,
} from './workspaceLogic';

const entries = (...relPaths: string[]): DocEntry[] => relPaths.map((p) => toDocEntry(p));

const rowLabels = (rows: VisibleRow[]): string[] =>
  rows.map((r) => `${r.depth}:${r.node.kind}:${r.node.path}`);

describe('initialExpandedPaths', () => {
  it('第 1 階層のフォルダ path のみを返す（ファイル・入れ子は含めない）', () => {
    const tree = buildTree(entries('docs/sub/a.md', 'alpha/b.md', 'z.md'));
    expect(initialExpandedPaths(tree).sort()).toEqual(['alpha', 'docs']);
  });

  it('フォルダが無ければ空配列', () => {
    const tree = buildTree(entries('a.md', 'b.md'));
    expect(initialExpandedPaths(tree)).toEqual([]);
  });
});

describe('toggleExpanded', () => {
  it('未展開の path は追加される', () => {
    const next = toggleExpanded(new Set(['docs']), 'alpha');
    expect(next.has('alpha')).toBe(true);
    expect(next.has('docs')).toBe(true);
  });

  it('展開済みの path は除去される', () => {
    const next = toggleExpanded(new Set(['docs', 'alpha']), 'docs');
    expect(next.has('docs')).toBe(false);
    expect(next.has('alpha')).toBe(true);
  });

  it('入力 Set を破壊しない（不変更新）', () => {
    const input = new Set(['docs']);
    toggleExpanded(input, 'alpha');
    expect([...input]).toEqual(['docs']);
  });
});

describe('flattenVisible', () => {
  it('折り畳まれたフォルダは children を出さない', () => {
    const tree = buildTree(entries('docs/a.md', 'docs/b.md'));
    const rows = flattenVisible(tree, new Set()); // docs 折り畳み
    expect(rowLabels(rows)).toEqual(['0:folder:docs']);
  });

  it('展開フォルダは children を depth+1 で出す', () => {
    const tree = buildTree(entries('docs/a.md', 'docs/b.md'));
    const rows = flattenVisible(tree, new Set(['docs']));
    expect(rowLabels(rows)).toEqual([
      '0:folder:docs',
      '1:file:docs/a.md',
      '1:file:docs/b.md',
    ]);
  });

  it('ルート直下のファイルは depth 0', () => {
    const tree = buildTree(entries('z.md'));
    const rows = flattenVisible(tree, new Set());
    expect(rowLabels(rows)).toEqual(['0:file:z.md']);
  });

  it('入れ子の展開は親が展開されている時のみ辿る', () => {
    const tree = buildTree(entries('a/b/c.md'));
    // a のみ展開、a/b は折り畳み → a/b までしか見えない
    const rows = flattenVisible(tree, new Set(['a']));
    expect(rowLabels(rows)).toEqual(['0:folder:a', '1:folder:a/b']);
    // a と a/b 両方展開 → c.md まで見える
    const rows2 = flattenVisible(tree, new Set(['a', 'a/b']));
    expect(rowLabels(rows2)).toEqual([
      '0:folder:a',
      '1:folder:a/b',
      '2:file:a/b/c.md',
    ]);
  });
});
