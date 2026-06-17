import { describe, it, expect } from 'vitest';
import { renderMermaidInHtml } from '../src/shared/renderMermaid.js';

describe('renderMermaidInHtml — cheap short-circuit path', () => {
  it('returns HTML unchanged when no mermaid class marker is present', async () => {
    const html = '<p>hello</p><pre><code class="language-ts">const x = 1;</code></pre>';
    const out = await renderMermaidInHtml(html);
    expect(out).toBe(html);
  });

  it('returns HTML unchanged for an invoice document (no code blocks at all)', async () => {
    const html =
      '<div class="mdb-invoice"><h1>御請求書</h1><table><tr><td>商品</td></tr></table></div>';
    const out = await renderMermaidInHtml(html);
    expect(out).toBe(html);
  });

  it('does not trigger import for an empty document', async () => {
    expect(await renderMermaidInHtml('')).toBe('');
  });

  it('detects a mermaid block by class marker (proceeds past the short-circuit)', async () => {
    // jsdom lacks the SVG layout that Mermaid needs, so the render itself will
    // throw — we assert that the function reaches the parse step (i.e. produces
    // the mdb-mermaid error wrapper) rather than returning the input verbatim.
    const html = '<pre><code class="language-mermaid">graph LR; A-->B</code></pre>';
    const out = await renderMermaidInHtml(html);
    expect(out).toContain('mdb-mermaid');
    // Original source preserved so the author can recover from render failures.
    expect(out).toContain('graph LR');
  });
});
