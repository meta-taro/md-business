import { describe, it, expect } from 'vitest';
import { isTsvSource, TSV_FORMAT_ID } from './detect';

/**
 * カスタム TSV 検証シートの判定（Issue 010・Block TSV-9）。
 *
 * エディター source を右ペインで「グリッド編集」か「読み取りプレビュー」の
 * どちらで開くかを、`#!` マジック行の formatId で振り分ける純関数。
 */
describe('isTsvSource', () => {
  it('detects a source whose first line is the v1 magic', () => {
    const src = `#! ${TSV_FORMAT_ID}\n項目\t結果:enum(〇|×)\nログイン\t〇`;
    expect(isTsvSource(src)).toBe(true);
  });

  it('tolerates missing space after #! and trailing CR', () => {
    expect(isTsvSource(`#!${TSV_FORMAT_ID}\r\n項目`)).toBe(true);
  });

  it('skips leading blank lines before the magic', () => {
    expect(isTsvSource(`\n\n  \n#! ${TSV_FORMAT_ID}\n項目`)).toBe(true);
  });

  it('rejects a different format id', () => {
    expect(isTsvSource('#! md-business:test-spec/v1\n項目')).toBe(false);
  });

  it('rejects Markdown / frontmatter sources', () => {
    expect(isTsvSource('---\nschema: test-spec/v1\n---\n# 見出し')).toBe(false);
    expect(isTsvSource('# ふつうの見出し\n本文')).toBe(false);
  });

  it('rejects an empty or whitespace-only source', () => {
    expect(isTsvSource('')).toBe(false);
    expect(isTsvSource('   \n\t\n')).toBe(false);
  });

  it('does not treat a non-magic first line as TSV even if the id appears later', () => {
    expect(isTsvSource(`項目\t結果\n#! ${TSV_FORMAT_ID}`)).toBe(false);
  });
});
