import { describe, it, expect } from 'vitest';
import {
  splitFrontmatter,
  MAX_FRONTMATTER_CHARS,
  MAX_YAML_ANCHORS,
} from '../src/frontmatter.js';

describe('splitFrontmatter', () => {
  it('splits standard frontmatter and body', () => {
    const src = `---\ntitle: Hello\namount: 1000\n---\n\nBody text.`;
    const result = splitFrontmatter(src);
    expect(result.data).toEqual({ title: 'Hello', amount: 1000 });
    // We preserve trailing whitespace verbatim so downstream renderers can
    // decide their own trimming policy. The body starts at the character
    // immediately after the closing `---\n`.
    expect(result.body).toBe('\nBody text.');
  });

  it('returns empty data when no frontmatter is present', () => {
    const src = `# Just a heading\n\nBody.`;
    const result = splitFrontmatter(src);
    expect(result.data).toEqual({});
    expect(result.body).toBe(src);
  });

  it('returns empty data when closing delimiter is missing', () => {
    const src = `---\ntitle: Hello\n\nBody without closing delimiter.`;
    const result = splitFrontmatter(src);
    expect(result.data).toEqual({});
    expect(result.body).toBe(src);
  });

  it('handles CRLF line endings', () => {
    const src = `---\r\ntitle: Hello\r\n---\r\n\r\nBody.`;
    const result = splitFrontmatter(src);
    expect(result.data).toEqual({ title: 'Hello' });
    expect(result.body).toBe('\r\nBody.');
  });

  it('strips a leading UTF-8 BOM', () => {
    const src = `﻿---\ntitle: Hello\n---\n\nBody.`;
    const result = splitFrontmatter(src);
    expect(result.data).toEqual({ title: 'Hello' });
    expect(result.body).toBe('\nBody.');
  });

  it('treats a `---` only on a non-leading line as part of the body', () => {
    const src = `Intro line\n---\ntitle: Hello\n---\n\nBody.`;
    const result = splitFrontmatter(src);
    expect(result.data).toEqual({});
    expect(result.body).toBe(src);
  });

  it('parses nested structures', () => {
    const src = `---\nseller:\n  name: Sample Co.\nitems:\n  - { name: A, price: 100 }\n  - { name: B, price: 200 }\n---\nbody`;
    const result = splitFrontmatter(src);
    expect(result.data).toMatchObject({
      seller: { name: 'Sample Co.' },
      items: [
        { name: 'A', price: 100 },
        { name: 'B', price: 200 },
      ],
    });
  });

  it('does not evaluate JavaScript-style frontmatter (CSP guard)', () => {
    // gray-matter would have routed this through eval(); js-yaml just treats
    // it as a YAML scalar/mapping. The point of this test is that nothing
    // explodes and no code execution happens.
    const src = `---\nx: "() => { throw new Error('boom') }"\n---\nbody`;
    const result = splitFrontmatter(src);
    expect(result.data['x']).toBe("() => { throw new Error('boom') }");
    expect(result.body).toBe('body');
  });

  it('throws on malformed YAML', () => {
    const src = `---\n  : invalid\n   indent: bad\n---\nbody`;
    expect(() => splitFrontmatter(src)).toThrow();
  });
});

// A YAML block is a document header, not a payload. Both limits below exist so
// that a hostile .md cannot make the parser burn memory before any schema code
// gets a chance to reject it.
describe('splitFrontmatter — input limits', () => {
  it('accepts a frontmatter block at the size limit', () => {
    const filler = 'x'.repeat(MAX_FRONTMATTER_CHARS - 20);
    const src = `---
note: ${filler}
---
body`;
    expect(splitFrontmatter(src).data['note']).toBe(filler);
  });

  it('rejects a frontmatter block past the size limit', () => {
    const filler = 'x'.repeat(MAX_FRONTMATTER_CHARS + 1);
    const src = `---
note: ${filler}
---
body`;
    expect(() => splitFrontmatter(src)).toThrow(/too large/i);
  });

  it('allows a handful of anchors', () => {
    const src = `---
defaults: &d
  currency: JPY
a: *d
b: *d
---
body`;
    expect(splitFrontmatter(src).data).toMatchObject({
      a: { currency: 'JPY' },
      b: { currency: 'JPY' },
    });
  });

  // Chained anchors double the expanded size at every step, so a few dozen
  // lines can expand to gigabytes during parsing. Cap the anchor count instead,
  // because the cost is already paid by the time the loaded value is inspected.
  it('rejects a frontmatter block with too many anchors', () => {
    const lines = ['a0: &a0 ["x", "x"]'];
    for (let i = 1; i <= MAX_YAML_ANCHORS + 1; i += 1) {
      lines.push(`a${i}: &a${i} [*a${i - 1}, *a${i - 1}]`);
    }
    const src = ['---', ...lines, '---', 'body'].join('\n');
    expect(() => splitFrontmatter(src)).toThrow(/anchor/i);
  });

  // js-yaml stops composing past 100 levels, so a nesting bomb comes back as a
  // YAML error rather than a stack overflow. Pinned here because the depth
  // guard downstream relies on the Markdown path already being bounded.
  it('rejects a nesting bomb rather than overflowing the composer', () => {
    const depth = 60_000;
    const flow = `---\nx: ${'['.repeat(depth)}${']'.repeat(depth)}\n---\nbody`;
    expect(() => splitFrontmatter(flow)).toThrow(/maxDepth/i);

    const indented = Array.from({ length: 300 }, (_, i) => `${'  '.repeat(i)}of:`).join('\n');
    const block = `---\n${indented}\n---\nbody`;
    expect(() => splitFrontmatter(block)).toThrow(/maxDepth/i);
  });

  it('does not count an ampersand inside prose as an anchor', () => {
    const src = `---
title: Research & Development
owner: A & B & C
---
body`;
    expect(splitFrontmatter(src).data['title']).toBe('Research & Development');
  });
});
