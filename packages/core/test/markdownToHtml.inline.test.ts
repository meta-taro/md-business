import { describe, it, expect } from 'vitest';
import { renderMarkdownToHtml } from '../src/markdownToHtml.js';

const render = (src: string, edition: 'internal' | 'submission' = 'internal'): string =>
  renderMarkdownToHtml(src, { hasFrontmatter: false, edition });

describe('renderMarkdownToHtml — マーカー（==…==）', () => {
  it('社内版では背景色の印にする', () => {
    expect(render('ここを==読み上げる==。')).toBe(
      '<p>ここを<mark class="mdb-mark">読み上げる</mark>。</p>',
    );
  });

  it('提出版では印を外して文字だけ残す', () => {
    expect(render('ここを==読み上げる==。', 'submission')).toBe('<p>ここを読み上げる。</p>');
  });

  it('強調をまたいでも 1 つの印になる', () => {
    expect(render('==**大事**な文==')).toBe(
      '<p><mark class="mdb-mark"><strong>大事</strong>な文</mark></p>',
    );
  });

  it('対にならない記号や比較の式は、そのまま文字で残す', () => {
    expect(render('a == b')).toBe('<p>a == b</p>');
    expect(render('==閉じない')).toBe('<p>==閉じない</p>');
    expect(render('x === y')).toBe('<p>x === y</p>');
  });

  it('コードの中は触らない', () => {
    expect(render('`==a==`')).toBe('<p><code>==a==</code></p>');
    expect(render('```\n==a==\n```')).toContain('==a==');
  });

  it('見出しの id は印の有無で変わらない', () => {
    expect(render('## ==重要==な章')).toContain('id="重要な章"');
  });
});

describe('renderMarkdownToHtml — 決めた形のタグだけ通す', () => {
  it('<mark> はマーカーと同じ扱い', () => {
    expect(render('<mark>読む</mark>文')).toBe('<p><mark class="mdb-mark">読む</mark>文</p>');
    expect(render('<mark>読む</mark>文', 'submission')).toBe('<p>読む文</p>');
  });

  it('<u> は下線にする（提出版でも残す）', () => {
    expect(render('<u>下線</u>の文')).toBe('<p><u>下線</u>の文</p>');
    expect(render('<u>下線</u>の文', 'submission')).toBe('<p><u>下線</u>の文</p>');
  });

  it('<span style="color:…"> は文字色にする', () => {
    expect(render('<span style="color: blue">青</span>字')).toBe(
      '<p><span style="color: blue">青</span>字</p>',
    );
    expect(render("<span style='color:#1a73e8'>青</span>")).toBe(
      '<p><span style="color: #1a73e8">青</span></p>',
    );
    expect(render('<span style="color: rgb(0, 80, 200)">青</span>')).toBe(
      '<p><span style="color: rgb(0, 80, 200)">青</span></p>',
    );
  });

  it('色以外を含む style や、色に見えない値は通さない（中の文字は残す）', () => {
    expect(render('<span style="color: red; background: url(x)">a</span>')).toBe('<p>a</p>');
    expect(render('<span style="color: expression(alert(1))">a</span>')).toBe('<p>a</p>');
    expect(render('<span onclick="x()">a</span>')).toBe('<p>a</p>');
  });

  it('決めていないタグは今までどおり落とす', () => {
    expect(render('<b>太</b>字')).toBe('<p>太字</p>');
    expect(render('<script>alert(1)</script>')).not.toContain('script');
  });

  it('閉じていないタグは印にしない', () => {
    expect(render('<u>閉じない')).toBe('<p>閉じない</p>');
  });

  it('入れ子にできる', () => {
    expect(render('<u><span style="color:red">赤い下線</span></u>')).toBe(
      '<p><u><span style="color: red">赤い下線</span></u></p>',
    );
  });
});

describe('renderMarkdownToHtml — 目次', () => {
  const DOC = ['# 概要', '', '本文', '', '## 構成', '', '### 画面', '', '#### 細目', '', '## 運用'].join('\n');

  it('既定では目次を作らない', () => {
    expect(render(DOC)).not.toContain('mdb-toc');
  });

  it('見出しから目次を作り、各見出しへのリンクにする（h1〜h3）', () => {
    const html = renderMarkdownToHtml(DOC, { hasFrontmatter: false, toc: true });
    expect(html.startsWith('<nav class="mdb-toc"')).toBe(true);
    expect(html).toContain('<p class="mdb-toc__head">目次</p>');
    expect(html).toContain('<a href="#概要">概要</a>');
    expect(html).toContain('<a href="#構成">構成</a>');
    expect(html).toContain('<a href="#画面">画面</a>');
    expect(html).toContain('<a href="#運用">運用</a>');
    expect(html).not.toContain('<a href="#細目">');
    // 深さは項目の class で表す（印刷で字下げする）。
    expect(html).toMatch(/<li class="mdb-toc__item mdb-toc__item--2"><a href="#構成">構成<\/a><\/li>/);
    expect(html).toMatch(/<li class="mdb-toc__item mdb-toc__item--3"><a href="#画面">画面<\/a><\/li>/);
  });

  it('見出しが無ければ目次を出さない', () => {
    expect(renderMarkdownToHtml('本文だけ', { hasFrontmatter: false, toc: true })).toBe('<p>本文だけ</p>');
  });

  it('提出版では社内の囲みの見出しを載せない', () => {
    const src = '## 公開\n\n::: 社内\n## 内部\n:::\n';
    const html = renderMarkdownToHtml(src, { hasFrontmatter: false, toc: true, edition: 'submission' });
    expect(html).toContain('href="#公開"');
    expect(html).not.toContain('内部');
  });

  it('注釈の見出しは載せない', () => {
    const html = renderMarkdownToHtml('## 章\n\n本文[^1]\n\n[^1]: 注', { hasFrontmatter: false, toc: true });
    expect(html).not.toContain('href="#footnote-label"');
  });

  it('文書の言語で見出しを付ける', () => {
    const html = renderMarkdownToHtml('## a', { hasFrontmatter: false, toc: true, lang: 'en' });
    expect(html).toContain('<p class="mdb-toc__head">Contents</p>');
  });

  it('同じ名前の見出しは枝番の id を指す', () => {
    const html = renderMarkdownToHtml('## 画面\n\n## 画面', { hasFrontmatter: false, toc: true });
    expect(html).toContain('href="#画面"');
    expect(html).toContain('href="#画面-1"');
  });
});
