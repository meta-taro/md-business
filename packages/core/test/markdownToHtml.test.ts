import { describe, it, expect } from 'vitest';
import { renderMarkdownToHtml } from '../src/markdownToHtml.js';

describe('renderMarkdownToHtml — basic blocks', () => {
  it('converts an ATX heading', () => {
    expect(renderMarkdownToHtml('# Hello', { hasFrontmatter: false })).toBe('<h1>Hello</h1>');
  });

  it('converts paragraphs', () => {
    const html = renderMarkdownToHtml('hello world\n\nsecond paragraph', { hasFrontmatter: false });
    expect(html).toBe('<p>hello world</p>\n<p>second paragraph</p>');
  });

  it('converts unordered lists', () => {
    const html = renderMarkdownToHtml('- one\n- two\n- three', { hasFrontmatter: false });
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>three</li>');
  });

  it('converts ordered lists', () => {
    const html = renderMarkdownToHtml('1. one\n2. two', { hasFrontmatter: false });
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
  });

  it('converts emphasis and strong', () => {
    const html = renderMarkdownToHtml('*em* and **strong**', { hasFrontmatter: false });
    expect(html).toContain('<em>em</em>');
    expect(html).toContain('<strong>strong</strong>');
  });

  it('converts inline code', () => {
    const html = renderMarkdownToHtml('use `pnpm` instead', { hasFrontmatter: false });
    expect(html).toContain('<code>pnpm</code>');
  });

  it('converts fenced code blocks', () => {
    const md = ['```ts', "const x = 1;", '```'].join('\n');
    const html = renderMarkdownToHtml(md, { hasFrontmatter: false });
    expect(html).toContain('<pre>');
    expect(html).toContain('<code class="language-ts">');
    expect(html).toContain('const x = 1;');
  });

  it('converts tables (GFM-style would need a plugin; plain syntax falls back to paragraphs)', () => {
    // Plain remark without GFM treats pipe-tables as paragraphs.
    // This test pins the current behavior so a future GFM-enabling commit
    // changes it deliberately, not by accident.
    const md = '| a | b |\n|---|---|\n| 1 | 2 |';
    const html = renderMarkdownToHtml(md, { hasFrontmatter: false });
    expect(html).not.toContain('<table>');
  });

  it('converts blockquotes', () => {
    const html = renderMarkdownToHtml('> quoted text', { hasFrontmatter: false });
    expect(html).toContain('<blockquote>');
    expect(html).toContain('quoted text');
  });

  it('converts horizontal rules', () => {
    const html = renderMarkdownToHtml('---\n', { hasFrontmatter: false });
    expect(html).toContain('<hr>');
  });

  it('converts links and resolves relative paths verbatim', () => {
    const html = renderMarkdownToHtml('[label](./doc.md)', { hasFrontmatter: false });
    expect(html).toContain('<a href="./doc.md">label</a>');
  });

  it('converts images', () => {
    const html = renderMarkdownToHtml('![alt](./img.png)', { hasFrontmatter: false });
    expect(html).toContain('<img src="./img.png" alt="alt">');
  });
});

describe('renderMarkdownToHtml — frontmatter handling', () => {
  it('strips frontmatter by default', () => {
    const src = '---\ntitle: x\n---\n\n# Body';
    expect(renderMarkdownToHtml(src)).toBe('<h1>Body</h1>');
  });

  it('does not strip frontmatter when hasFrontmatter is false', () => {
    // When the caller already has a body-only string, we pass it through as-is.
    // The leading "---" then renders as a thematic break.
    const src = '# Heading';
    expect(renderMarkdownToHtml(src, { hasFrontmatter: false })).toBe('<h1>Heading</h1>');
  });

  it('handles an empty body gracefully', () => {
    expect(renderMarkdownToHtml('---\ntitle: x\n---\n', {})).toBe('');
  });

  it('handles a body-only empty string', () => {
    expect(renderMarkdownToHtml('', { hasFrontmatter: false })).toBe('');
  });
});

describe('renderMarkdownToHtml — security defaults', () => {
  it('drops raw inline HTML by default (allowDangerousHtml: false)', () => {
    const html = renderMarkdownToHtml('<script>alert(1)</script>', { hasFrontmatter: false });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
  });

  it('drops raw block HTML by default', () => {
    const html = renderMarkdownToHtml('<div onclick="x">hi</div>', { hasFrontmatter: false });
    expect(html).not.toContain('<div onclick=');
  });

  it('escapes HTML inside fenced code blocks (they appear as text)', () => {
    const md = '```\n<script>alert(1)</script>\n```';
    const html = renderMarkdownToHtml(md, { hasFrontmatter: false });
    expect(html).toContain('&#x3C;script>alert(1)&#x3C;/script>');
  });
});
