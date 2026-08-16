import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizeViewerHtml, _resetSanitizerForTest } from '../src/shared/sanitizeHtml.js';

beforeEach(() => {
  _resetSanitizerForTest();
});

describe('sanitizeViewerHtml — script / event handler hardening', () => {
  it('drops <script> tags entirely', () => {
    const out = sanitizeViewerHtml('<p>safe</p><script>alert(1)</script>');
    expect(out).toContain('<p>safe</p>');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert(1)');
  });

  it('drops inline event handlers', () => {
    const out = sanitizeViewerHtml('<div onclick="alert(1)">click</div>');
    expect(out).toContain('click');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('alert(1)');
  });

  it('drops <img onerror>', () => {
    const out = sanitizeViewerHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('drops javascript: URLs on links', () => {
    const out = sanitizeViewerHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('drops <iframe> entirely (avoid embedded navigation)', () => {
    const out = sanitizeViewerHtml('<iframe src="https://example.com"></iframe>');
    expect(out).not.toContain('<iframe');
  });

  it('drops <form> and <input>', () => {
    const out = sanitizeViewerHtml('<form><input name="x"></form>');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<input');
  });
});

describe('sanitizeViewerHtml — image src allowlist', () => {
  it('allows https: image src', () => {
    const out = sanitizeViewerHtml('<img src="https://example.com/a.png" alt="a">');
    expect(out).toContain('src="https://example.com/a.png"');
  });

  it('allows data:image/png;base64 image src', () => {
    const out = sanitizeViewerHtml(
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="a">',
    );
    expect(out).toContain('data:image/png;base64,iVBORw0KGgo=');
  });

  it('allows data:image/svg+xml;base64 image src', () => {
    const out = sanitizeViewerHtml(
      '<img src="data:image/svg+xml;base64,PHN2Zy8+" alt="a">',
    );
    expect(out).toContain('data:image/svg+xml;base64,PHN2Zy8+');
  });

  it('allows blob: image src (for future resolver)', () => {
    const out = sanitizeViewerHtml('<img src="blob:https://x/abc" alt="a">');
    expect(out).toContain('blob:https://x/abc');
  });

  it('strips data:text/html src (cannot smuggle HTML through an image)', () => {
    const out = sanitizeViewerHtml('<img src="data:text/html,<script>1</script>">');
    expect(out).not.toContain('data:text/html');
    expect(out).not.toContain('<script>');
  });

  it('strips http: image src (downgrade attack)', () => {
    const out = sanitizeViewerHtml('<img src="http://example.com/a.png" alt="a">');
    expect(out).not.toContain('http://example.com/a.png');
  });

  it('strips relative image src until the local resolver lands', () => {
    const out = sanitizeViewerHtml('<img src="./img.png" alt="a">');
    expect(out).not.toContain('./img.png');
    expect(out).toContain('alt="a"');
  });
});

describe('sanitizeViewerHtml — inline SVG', () => {
  it('keeps a basic inline <svg> with shape attributes', () => {
    const out = sanitizeViewerHtml(
      '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" fill="red"/></svg>',
    );
    expect(out).toContain('<svg');
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain('<rect');
    expect(out).toContain('fill="red"');
  });

  it('drops <script> inside <svg>', () => {
    const out = sanitizeViewerHtml(
      '<svg><script>alert(1)</script><rect width="10" height="10"/></svg>',
    );
    expect(out).toContain('<svg');
    expect(out).toContain('<rect');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert(1)');
  });

  it('drops <svg onload>', () => {
    const out = sanitizeViewerHtml('<svg onload="alert(1)"><circle r="5"/></svg>');
    expect(out).not.toContain('onload');
    expect(out).not.toContain('alert(1)');
  });

  it('drops the whole <svg> when allowSvg=false', () => {
    const out = sanitizeViewerHtml('<svg><rect/></svg>', { allowSvg: false });
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('<rect');
  });
});

describe('sanitizeViewerHtml — Mermaid code block survives intact', () => {
  it('preserves <pre><code class="language-mermaid"> for downstream rendering', () => {
    const md = '<pre><code class="language-mermaid">graph TD; A--&gt;B;</code></pre>';
    const out = sanitizeViewerHtml(md);
    expect(out).toContain('<pre>');
    expect(out).toContain('class="language-mermaid"');
    expect(out).toContain('graph TD');
  });
});

describe('sanitizeViewerHtml — normal markdown output passes through', () => {
  it('keeps headings, paragraphs, lists, and inline code', () => {
    const md = [
      '<h1>Title</h1>',
      '<p>Paragraph with <code>inline</code> code.</p>',
      '<ul><li>one</li><li>two</li></ul>',
    ].join('');
    const out = sanitizeViewerHtml(md);
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<code>inline</code>');
    expect(out).toContain('<li>one</li>');
  });

  it('keeps tables', () => {
    const md = '<table><tr><th>a</th></tr><tr><td>1</td></tr></table>';
    const out = sanitizeViewerHtml(md);
    expect(out).toContain('<table>');
    expect(out).toContain('<th>a</th>');
    expect(out).toContain('<td>1</td>');
  });

  it('keeps anchor links with safe href schemes', () => {
    const out = sanitizeViewerHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('href="https://example.com"');
  });

  it('keeps anchor links with hash fragments', () => {
    const out = sanitizeViewerHtml('<a href="#section-1">x</a>');
    expect(out).toContain('href="#section-1"');
  });
});

// 隣の文書を指すリンク（`[根拠](evidence/EV-001.md)` など）。ここを落とすと、
// 文書どうしを行き来する経路がプレビューから消える。ポリシーはデスクトップ側
// (apps/desktop/src/lib/preview/sanitizeHtml.ts) と同じものを保つ。
describe('sanitizeViewerHtml — relative document links', () => {
  it('keeps relative links', () => {
    expect(sanitizeViewerHtml('<a href="./b.md">x</a>')).toContain('href="./b.md"');
    expect(sanitizeViewerHtml('<a href="evidence/EV-001.md">x</a>')).toContain(
      'href="evidence/EV-001.md"',
    );
    expect(sanitizeViewerHtml('<a href="../logs/app.jsonl">x</a>')).toContain(
      'href="../logs/app.jsonl"',
    );
  });

  it('keeps the fragment and query on a relative link', () => {
    expect(sanitizeViewerHtml('<a href="a.md#所見">x</a>')).toContain('href="a.md#所見"');
    expect(sanitizeViewerHtml('<a href="a.md?v=1">x</a>')).toContain('href="a.md?v=1"');
  });

  // スキームを名乗るには `:` が要る。空白・制御文字を挟んでも `:` は消せない。
  it('still drops javascript: even when obfuscated with whitespace', () => {
    const out = sanitizeViewerHtml('<a href="java&#9;script:alert(1)">x</a>');
    expect(out).not.toContain('script:');
    expect(out).not.toContain('alert(1)');
  });

  it('still drops http: downgrades and scheme-relative URLs', () => {
    expect(sanitizeViewerHtml('<a href="http://example.com">x</a>')).not.toContain('href=');
    expect(sanitizeViewerHtml('<a href="//example.com/a">x</a>')).not.toContain('href=');
  });

  it('does not extend the relaxation to src', () => {
    expect(sanitizeViewerHtml('<img src="./local.png">')).not.toContain('src=');
  });
});

describe('sanitizeViewerHtml — empty / edge inputs', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeViewerHtml('')).toBe('');
  });

  it('returns the string itself for plain text input', () => {
    expect(sanitizeViewerHtml('hello')).toBe('hello');
  });
});
