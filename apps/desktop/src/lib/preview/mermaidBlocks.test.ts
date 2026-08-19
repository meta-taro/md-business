import { describe, expect, it, vi } from 'vitest';
import { loadMermaidImages } from './mermaidBlocks';

const FENCE = '```';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 320 180"><g/></svg>';

function block(body: string): string {
  return `${FENCE}mermaid\n${body}\n${FENCE}`;
}

function decode(markup: string): string {
  const found = /base64,([^)]+)\)/.exec(markup);
  if (found === null) throw new Error(`画像になっていない: ${markup}`);
  return new TextDecoder().decode(Uint8Array.from(atob(found[1]), (c) => c.charCodeAt(0)));
}

describe('図（Mermaid）を画像にする', () => {
  it('囲みを画像の記法にする', async () => {
    const source = block('graph TD\n  A --> B');
    const out = await loadMermaidImages(source, { theme: 'light', render: () => Promise.resolve(SVG) });
    const markup = out.get(source);
    expect(markup).toBeDefined();
    expect(markup).toContain('](data:image/svg+xml;base64,');
    expect(decode(markup ?? '')).toContain('<svg');
  });

  it('大きさを viewBox から決める（画像として貼ると割合指定が効かない）', async () => {
    const out = await loadMermaidImages(block('graph TD\n  A --> B'), {
      theme: 'light',
      render: () => Promise.resolve(SVG),
    });
    const svg = decode([...out.values()][0]);
    expect(svg).toContain('width="320"');
    expect(svg).toContain('height="180"');
    expect(svg).not.toContain('width="100%"');
  });

  it('描けなければ元の囲みを残す', async () => {
    const source = block('graph TD\n  A -->');
    const out = await loadMermaidImages(source, {
      theme: 'light',
      render: () => Promise.reject(new Error('parse error')),
    });
    expect(out.size).toBe(0);
  });

  it('図が無ければ描画を呼ばない', async () => {
    const render = vi.fn(() => Promise.resolve(SVG));
    const out = await loadMermaidImages('ただの本文', { theme: 'light', render });
    expect(out.size).toBe(0);
    expect(render).not.toHaveBeenCalled();
  });

  it('同じ図が 2 つあれば描くのは 1 度', async () => {
    const render = vi.fn(() => Promise.resolve(SVG));
    const source = block('graph TD\n  A --> B');
    await loadMermaidImages(`${source}\n\n${source}`, { theme: 'light', render });
    expect(render).toHaveBeenCalledTimes(1);
  });
});
