import { describe, expect, it } from 'vitest';
import { indexWorkspace, searchIndex, searchWorkspace, titleOf } from '../src/localSearch.js';

describe('titleOf', () => {
  it('Markdown は frontmatter の title を優先する', () => {
    expect(titleOf('markdown', '---\ntitle: "倉庫の基本設計"\n---\n# 見出し\n')).toBe('倉庫の基本設計');
  });
  it('frontmatter が無ければ最初の # 見出し', () => {
    expect(titleOf('markdown', '本文\n# 見出し\n## 小見出し')).toBe('見出し');
  });
  it('TSV はメタ行の タイトル', () => {
    expect(titleOf('tsv', '#! md-business:test-spec-tsv/v1\n# タイトル: ログイン\nNo.\t項目')).toBe('ログイン');
  });
  it('zumen は最上位の title', () => {
    expect(titleOf('zumen', 'version: 1\ntitle: 本番構成\nnodes:\n  - id: a\n    title: 子\n')).toBe('本番構成');
  });
  it('TSV の全角コロンも受ける', () => {
    expect(titleOf('tsv', '#! md-business:test-spec-tsv/v1\n# タイトル：ログイン')).toBe('ログイン');
  });
  it('コードブロックの中の # は見出しにしない', () => {
    expect(titleOf('markdown', '```sh\n# コメント\n```\n# 本当の見出し')).toBe('本当の見出し');
  });
  it('先頭の BOM と CRLF を気にしない', () => {
    expect(titleOf('markdown', '\ufeff# 見出し\r\n本文')).toBe('見出し');
  });
  it('見つからなければ null', () => {
    expect(titleOf('markdown', '本文だけ')).toBeNull();
    expect(titleOf('image', '')).toBeNull();
  });
});

describe('searchWorkspace', () => {
  const files = [
    { path: 'docs/a.md', text: '# 倉庫システム\n入出庫の流れ' },
    { path: 'docs/倉庫.md', text: '本文に関係ない' },
    { path: 'docs/c.md', text: '途中で倉庫に触れる' },
    { path: 'img/logo.png' },
  ];

  it('名前 > 題名 > 本文 の順に並ぶ', () => {
    const hits = searchWorkspace(files, '倉庫');
    expect(hits.map((h) => h.path)).toEqual(['docs/倉庫.md', 'docs/a.md', 'docs/c.md']);
    expect(hits.map((h) => h.matchedIn)).toEqual(['name', 'title', 'body']);
  });

  it('語はすべて含むものだけ当たる（AND）', () => {
    expect(searchWorkspace(files, '倉庫 入出庫').map((h) => h.path)).toEqual(['docs/a.md']);
  });

  it('本文で当たったものには前後の抜粋を付ける', () => {
    const [hit] = searchWorkspace(files, '触れる');
    expect(hit?.snippet).toContain('触れる');
  });

  it('本文を持たないファイルも名前では当たる', () => {
    expect(searchWorkspace(files, 'logo').map((h) => h.path)).toEqual(['img/logo.png']);
  });

  it('フォルダ名ではなくファイル名で当てる', () => {
    expect(searchWorkspace(files, 'docs')).toEqual([]);
  });

  it('拡張子では当てない', () => {
    expect(searchWorkspace(files, 'md')).toEqual([]);
  });

  it('全角で書かれた本文でも抜粋は当たった所を指す', () => {
    const text = `${'前置き。'.repeat(40)}ここでＡＰＩ仕様を決める`;
    const [hit] = searchWorkspace([{ path: 'x.md', text }], 'api');
    expect(hit?.snippet).toContain('ＡＰＩ仕様');
  });

  it('同点はロケールに依らず符号位置の順', () => {
    const hits = searchWorkspace([{ path: 'b.md' }, { path: 'B.md' }, { path: 'a.md' }], 'md');
    expect(hits).toEqual([]);
    const tie = searchWorkspace([{ path: 'b-x.md' }, { path: 'B-x.md' }, { path: 'a-x.md' }], 'x');
    expect(tie.map((h) => h.path)).toEqual(['B-x.md', 'a-x.md', 'b-x.md']);
  });

  it('前処理した索引を使い回しても結果は同じ', () => {
    const index = indexWorkspace(files);
    expect(searchIndex(index, '倉庫')).toEqual(searchWorkspace(files, '倉庫'));
    expect(index[0]?.title).toBe('倉庫システム');
  });

  it('カタカナとひらがなを区別しない', () => {
    const hits = searchWorkspace([{ path: 'サーバ構成.md', text: '' }], 'さーば');
    expect(hits).toHaveLength(1);
  });

  it('空の検索語では何も返さない', () => {
    expect(searchWorkspace(files, '  ')).toEqual([]);
  });

  it('上限で切る', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ path: `n${i}.md`, text: '' }));
    expect(searchWorkspace(many, 'n', { limit: 5 })).toHaveLength(5);
  });
});
