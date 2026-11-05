import { describe, it, expect } from 'vitest';
import { renderMarkdownToHtml } from '../src/markdownToHtml.js';

const BODY = ['公開してよい説明。', '', '::: 社内', '実装メモ。', ':::', '', '後ろの段落。'].join('\n');
const render = (src: string, edition: 'internal' | 'submission' = 'internal', lang = 'ja'): string =>
  renderMarkdownToHtml(src, { hasFrontmatter: false, edition, lang });

describe('renderMarkdownToHtml — edition', () => {
  it('wraps a 社内 block with a labelled box in the internal edition (default)', () => {
    const html = render(BODY);
    expect(html).toContain(
      '<div class="mdb-internal"><p class="mdb-internal__label">社内</p>\n<p>実装メモ。</p>\n</div>',
    );
    expect(html).toContain('<p>公開してよい説明。</p>');
    expect(html).toContain('<p>後ろの段落。</p>');
    expect(html).not.toContain(':::');
    expect(renderMarkdownToHtml(BODY, { hasFrontmatter: false })).toBe(html);
  });

  it('drops the block in the submission edition', () => {
    const html = render(BODY, 'submission');
    expect(html).not.toContain('実装メモ');
    expect(html).not.toContain('mdb-internal');
    expect(html).toContain('<p>公開してよい説明。</p>');
    expect(html).toContain('<p>後ろの段落。</p>');
  });

  it('keeps headings and lists inside the box', () => {
    const html = render('::: 社内\n## 内部の節\n\n- a\n- b\n:::\n');
    expect(html).toMatch(/<div class="mdb-internal">[\s\S]*<h2 id="内部の節">内部の節<\/h2>[\s\S]*<li>a<\/li>[\s\S]*<\/div>/);
  });

  it('runs an unclosed block to the end', () => {
    const html = render('a\n\n::: 社内\nsecret\n');
    expect(html).toMatch(/<div class="mdb-internal">[\s\S]*secret[\s\S]*<\/div>$/);
    expect(render('a\n\n::: 社内\nsecret\n', 'submission')).not.toContain('secret');
  });

  it('labels the box in the document language', () => {
    expect(render(BODY, 'internal', 'en')).toContain('<p class="mdb-internal__label">Internal</p>');
  });

  it('leaves a block shown inside a code fence as code', () => {
    const html = render('```md\n::: 社内\nx\n:::\n```');
    expect(html).toContain('::: 社内');
    expect(html).not.toContain('mdb-internal');
  });
});
