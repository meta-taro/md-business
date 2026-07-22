// @vitest-environment jsdom
//
// Markdown フォールバックは本文を HTML 化・sanitize（DOMPurify）して描くため
// window が要る。よって prose.test と同じく jsdom に切り替える。
import { describe, it, expect } from 'vitest';
import { renderMarkdownFallback } from './markdownFallback';

describe('renderMarkdownFallback — 業務スキーマ非該当 .md の標準プレビュー', () => {
  it('frontmatter 無しのプレーン Markdown を HTML 化して描く', () => {
    const body = ['# はじめに', '', '本文テキスト。', '', '- 箇条書き'].join('\n');
    const r = renderMarkdownFallback(body);
    expect(r.ok).toBe(true);
    expect(r.label).toBe('Markdown');
    expect(r.srcdoc).toContain('<!doctype html>');
    expect(r.srcdoc).toContain('はじめに');
    expect(r.srcdoc).toContain('本文テキスト。');
    expect(r.srcdoc).toContain('箇条書き');
  });

  it('先頭見出しを documentTitle に採る（無ければ Markdown）', () => {
    expect(renderMarkdownFallback('# タイトル行\n\n本文').documentTitle).toBe('タイトル行');
    expect(renderMarkdownFallback('見出しの無い本文').documentTitle).toBe('Markdown');
  });

  it('<script> はサニタイズで落ちる（XSS 防御）', () => {
    const r = renderMarkdownFallback('# 見出し\n\n<script>alert(1)</script>');
    expect(r.srcdoc).not.toContain('<script>alert(1)</script>');
    expect(r.srcdoc).not.toContain('alert(1)');
  });

  it('theme を iframe 内 <html data-theme> に伝える', () => {
    const r = renderMarkdownFallback('# 本文', { theme: 'dark' });
    expect(r.srcdoc).toContain('data-theme="dark"');
  });

  it('warnings / errors は常に空配列（フォールバックは検証しない）', () => {
    const r = renderMarkdownFallback('# 本文');
    expect(r.warnings).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  // 印刷（PDF 出力）は紙なので横スクロールできない。ページ幅を超える内容
  // （コードフェンス・長い行・広い表）が右端で欠落しないよう、折り返しと A4 を保証する。
  it('コードフェンスは折り返して印刷時に欠けない（pre-wrap）', () => {
    const r = renderMarkdownFallback('# 見出し\n\n```\nx\n```');
    expect(r.srcdoc).toContain('pre-wrap');
  });

  it('PDF 用に A4 @page と @media print の折り返し指定を持つ', () => {
    const r = renderMarkdownFallback('# 見出し');
    expect(r.srcdoc).toContain('@page');
    expect(r.srcdoc).toContain('A4');
    expect(r.srcdoc).toContain('@media print');
  });
});
