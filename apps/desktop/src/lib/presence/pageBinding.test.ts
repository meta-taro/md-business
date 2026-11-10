import { describe, expect, it } from 'vitest';
import { markdownPlace, repoRelativePath, tsvPlace } from './pageBinding';

describe('repoRelativePath', () => {
  it('開いたフォルダの prefix を頭に付ける', () => {
    expect(repoRelativePath('apps/desktop/', 'docs/a.md')).toBe('apps/desktop/docs/a.md');
  });

  it('repo root を開いたときはそのまま', () => {
    expect(repoRelativePath('', 'a.md')).toBe('a.md');
  });

  it('Windows の区切りを / に揃える', () => {
    expect(repoRelativePath('', 'docs\\a.md')).toBe('docs/a.md');
  });
});

describe('markdownPlace', () => {
  it('ブランチと 1 始まりの行を持つ', () => {
    expect(markdownPlace('main', 3)).toEqual({ kind: 'markdown', branch: 'main', line: 3 });
  });

  it('ブランチが分からない（detached）ときは空文字', () => {
    expect(markdownPlace(null, 1)).toEqual({ kind: 'markdown', branch: '', line: 1 });
  });

  it('1 未満や整数でない行は場所にしない', () => {
    expect(markdownPlace('main', 0)).toBeNull();
    expect(markdownPlace('main', 1.5)).toBeNull();
  });
});

describe('tsvPlace', () => {
  const grid = { rowIds: [] as string[], columns: ['No.', '項目'], rowCount: 5, arranged: false };

  it('行 ID があれば行 ID で指す', () => {
    expect(tsvPlace('main', { ...grid, rowIds: ['r1', 'r2'] }, { row: 1, col: 1 })).toEqual({
      kind: 'tsv',
      branch: 'main',
      rowId: 'r2',
      column: '項目',
    });
  });

  it('行 ID の無い表は行番号で指す', () => {
    expect(tsvPlace('main', grid, { row: 4, col: 0 })).toEqual({
      kind: 'tsv',
      branch: 'main',
      row: 4,
      column: 'No.',
    });
  });

  it('行 ID が空の行も行番号で指す', () => {
    expect(tsvPlace('main', { ...grid, rowIds: ['r1', ''] }, { row: 1, col: 0 })).toEqual({
      kind: 'tsv',
      branch: 'main',
      row: 1,
      column: 'No.',
    });
  });

  it('列の外・負の行・データ行より下の空行は場所にしない', () => {
    expect(tsvPlace('main', grid, { row: 0, col: 2 })).toBeNull();
    expect(tsvPlace('main', grid, { row: -1, col: 0 })).toBeNull();
    expect(tsvPlace('main', grid, { row: 5, col: 0 })).toBeNull();
  });

  it('並べ替え・絞り込み中は、行 ID の無い行を指さない', () => {
    expect(tsvPlace('main', { ...grid, arranged: true }, { row: 1, col: 0 })).toBeNull();
  });

  it('並べ替え・絞り込み中でも、行 ID のある行は指せる', () => {
    expect(tsvPlace('main', { ...grid, rowIds: ['r1'], arranged: true }, { row: 0, col: 0 })).toEqual({
      kind: 'tsv',
      branch: 'main',
      rowId: 'r1',
      column: 'No.',
    });
  });
});
