import { describe, it, expect } from 'vitest';
import { frontmatterHint } from '../src/shared/frontmatterHint.js';
import { loadMarkdown, previewMarkdown } from '../src/shared/loadMarkdown.js';

// 行頭の字下げが崩れた frontmatter。パーサは英語で
// `bad indentation of a mapping entry (2:3)` と言うだけで、
// 書いた人には何を直せばよいか分からない。
const BAD_INDENT_MD = '---\nschemaVersion: "invoice/v1"\n  issueDate: "2026-06-30"\n---\n';

describe('frontmatterHint', () => {
  it('種類ごとの日本語の説明と、ファイル先頭からの行番号を返す', () => {
    const hint = frontmatterHint({
      kind: 'indentation',
      line: 39,
      column: 2,
      raw: 'bad indentation of a mapping entry',
    });
    expect(hint).toContain('39 行目');
    expect(hint).toContain('字下げ');
    expect(hint).not.toContain('bad indentation');
  });

  it('位置が取れなければ行番号を書かない', () => {
    const hint = frontmatterHint({ kind: 'tab', line: null, column: null, raw: 'tab characters' });
    expect(hint).not.toContain('行目');
    expect(hint).toContain('タブ');
  });

  it('分類できないものはパーサの原文を添える', () => {
    const hint = frontmatterHint({ kind: 'unknown', line: null, column: null, raw: 'odd thing' });
    expect(hint).toContain('odd thing');
  });
});

describe('frontmatter 解析失敗の説明', () => {
  it('loadMarkdown が日本語の説明を details に返す', () => {
    const result = loadMarkdown(BAD_INDENT_MD);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details?.[0]).toContain('3 行目');
    expect(result.details?.[0]).toContain('字下げ');
  });

  it('previewMarkdown も同じ説明を返す', () => {
    const result = previewMarkdown(BAD_INDENT_MD);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details?.[0]).toContain('3 行目');
  });
});
