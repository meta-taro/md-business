import { describe, it, expect } from 'vitest';
import { splitFrontmatter } from '../src/frontmatter.js';

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
