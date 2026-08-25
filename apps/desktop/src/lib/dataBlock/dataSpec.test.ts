import { describe, it, expect } from 'vitest';
import { parseDataSpec } from './dataSpec';

describe('データの囲みの指定を読む', () => {
  it('出どころだけ書けば通る', () => {
    expect(parseDataSpec('source: data/売上.tsv')).toEqual({
      ok: true,
      spec: { source: 'data/売上.tsv' },
    });
  });

  it('空行と覚え書きの行は読み飛ばす', () => {
    expect(parseDataSpec('\n# 月次\nsource: data/売上.tsv\n')).toEqual({
      ok: true,
      spec: { source: 'data/売上.tsv' },
    });
  });

  it('何も書いていなければ empty', () => {
    expect(parseDataSpec('   \n\n')).toEqual({
      ok: false,
      problem: { kind: 'empty', raw: '', line: null },
    });
  });

  it('`名前: 値` の形でない行は、どの行かまで返す', () => {
    expect(parseDataSpec('source: a.tsv\nこれは指定ではない')).toEqual({
      ok: false,
      problem: { kind: 'syntax', raw: 'これは指定ではない', line: 2 },
    });
  });

  it('知らない指定名は黙って捨てない（打ち間違いのため）', () => {
    expect(parseDataSpec('sauce: a.tsv')).toEqual({
      ok: false,
      problem: { kind: 'unknown-key', raw: 'sauce', line: 1 },
    });
  });

  it('同じ指定を 2 度書いたら、どちらが効くか決めずに断る', () => {
    expect(parseDataSpec('source: a.tsv\nsource: b.tsv')).toEqual({
      ok: false,
      problem: { kind: 'duplicate-key', raw: 'source', line: 2 },
    });
  });

  it('出どころが無ければ missing', () => {
    expect(parseDataSpec('# 何も指定していない\n')).toEqual({
      ok: false,
      problem: { kind: 'empty', raw: '', line: null },
    });
    expect(parseDataSpec('source:')).toEqual({
      ok: false,
      problem: { kind: 'missing', raw: 'source', line: null },
    });
  });
});
