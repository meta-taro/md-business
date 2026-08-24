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

  it('converts GFM pipe tables to <table>', () => {
    // remark-gfm enabled — the spec template's 機能一覧 / 比較表 など pipe table
    // を <table> 要素として描画する。viewer はこの HTML を Paged.js + spec.css
    // に流し込むので、ここで <table> が落ちると基本設計書のテーブルが
    // 生テキストとして出てしまう（過去に v0.4.0 で発生）。
    const md = '| a | b |\n|---|---|\n| 1 | 2 |';
    const html = renderMarkdownToHtml(md, { hasFrontmatter: false });
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders GFM strikethrough', () => {
    const html = renderMarkdownToHtml('~~old~~', { hasFrontmatter: false });
    expect(html).toContain('<del>old</del>');
  });

  it('renders GFM task lists', () => {
    const html = renderMarkdownToHtml('- [x] done\n- [ ] todo', { hasFrontmatter: false });
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
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

describe('renderMarkdownToHtml — 脚注（注釈）', () => {
  const FOOTNOTE = '本文[^1]です。\n\n[^1]: 単価は前期の実績に合わせた。';

  it('見出しを文書の言語で出す', () => {
    // remark-gfm の既定は英語の Footnotes。日本語の請求書・設計書へ
    // そのまま刷られるので、言語ごとに置き換える。
    expect(renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false, lang: 'ja' })).toContain('>注釈<');
    expect(renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false, lang: 'zh' })).toContain('>注释<');
    expect(renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false, lang: 'ko' })).toContain('>주석<');
    expect(renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false, lang: 'en' })).toContain('>Notes<');
  });

  it('言語を渡さなければ日本語', () => {
    expect(renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false })).toContain('>注釈<');
  });

  it('知らない言語は日本語に落とす', () => {
    expect(renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false, lang: 'fr' })).toContain('>注釈<');
  });

  it('見出しを sr-only で隠さない', () => {
    // sr-only はどのスタイルシートにも無い。隠す指定のつもりで隠れないまま
    // 出ていたので、こちらの持つ class を付けて体裁を当てられるようにする。
    const html = renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false });
    expect(html).not.toContain('sr-only');
    expect(html).toContain('class="mdb-footnotes__head"');
  });

  it('戻る記号のラベルも文書の言語で出す', () => {
    // 目には `↩` しか映らないが、読み上げはこのラベルを読む。ここだけ英語で
    // 残ると、日本語の文書を読み上げたときに一箇所だけ英語が挟まる。
    expect(renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false, lang: 'ja' })).toContain(
      'aria-label="注釈 1 の参照元へ戻る"',
    );
    expect(renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false, lang: 'en' })).toContain(
      'aria-label="Back to reference 1"',
    );
  });

  it('印のそばに注釈の本文を置く（末尾まで飛ばずに読めるように）', () => {
    // 末尾の一覧まで目を移すと、表や図の途中で読む場所を見失う。印の隣に
    // 同じ本文を持たせておき、重ねて出すのは各アプリの体裁に任せる。
    const html = renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false });
    const pop = /<span class="mdb-footnote__pop"[^>]*>([^<]*)<\/span>/.exec(html);
    expect(pop?.[1]).toBe('単価は前期の実績に合わせた。');
  });

  it('そばに置いた本文は読み上げに二度読ませない', () => {
    // 印には aria-describedby が付いていて、読み上げは末尾の本文を読む。
    const html = renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false });
    expect(html).toContain('<span class="mdb-footnote__pop" aria-hidden="true">');
  });

  it('そばに置いた本文へ戻る記号を混ぜない', () => {
    const html = renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false });
    const pop = /<span class="mdb-footnote__pop"[^>]*>([^<]*)<\/span>/.exec(html);
    expect(pop?.[1]).not.toContain('↩');
  });

  it('脚注が無ければ何も足さない', () => {
    const html = renderMarkdownToHtml('ただの本文。', { hasFrontmatter: false });
    expect(html).toBe('<p>ただの本文。</p>');
  });

  it('印と本文は今までどおり出す', () => {
    const html = renderMarkdownToHtml(FOOTNOTE, { hasFrontmatter: false });
    expect(html).toContain('data-footnote-ref');
    expect(html).toContain('単価は前期の実績に合わせた。');
  });
});

describe('renderMarkdownToHtml — rawHtml', () => {
  it('rawHtml で生の HTML をそのまま出す', () => {
    const html = renderMarkdownToHtml('<section class="hero">やあ</section>', {
      hasFrontmatter: false,
      rawHtml: true,
    });
    expect(html).toContain('<section class="hero">');
  });

  it('rawHtml で script をそのまま出す', () => {
    const html = renderMarkdownToHtml('<script>alert(1)</script>', {
      hasFrontmatter: false,
      rawHtml: true,
    });
    expect(html).toContain('<script>alert(1)</script>');
  });

  it('rawHtml でも囲みの中は文字のまま', () => {
    const md = '```\n<script>alert(1)</script>\n```';
    const html = renderMarkdownToHtml(md, { hasFrontmatter: false, rawHtml: true });
    expect(html).toContain('&#x3C;script>alert(1)&#x3C;/script>');
  });

  it('rawHtml を付けても Markdown の描き方は変わらない', () => {
    const md = '# 見出し\n\n| a | b |\n| --- | --- |\n| 1 | 2 |';
    const plain = renderMarkdownToHtml(md, { hasFrontmatter: false });
    const raw = renderMarkdownToHtml(md, { hasFrontmatter: false, rawHtml: true });
    expect(raw).toBe(plain);
  });
});
