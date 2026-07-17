import { describe, it, expect } from 'vitest';
import { serializeMarkdown } from '../src/serialize.js';
import { splitFrontmatter } from '../src/frontmatter.js';

describe('serializeMarkdown', () => {
  it('emits a YAML frontmatter block followed by the body', () => {
    const out = serializeMarkdown({ title: 'Hello', amount: 1000 }, 'Body text.');
    expect(out).toBe('---\ntitle: Hello\namount: 1000\n---\nBody text.');
  });

  it('round-trips with splitFrontmatter (data + body preserved)', () => {
    const data = { title: 'Hello', amount: 1000 };
    const body = '\nBody text.';
    const round = splitFrontmatter(serializeMarkdown(data, body));
    expect(round.data).toEqual(data);
    expect(round.body).toBe(body);
  });

  it('returns the body unchanged when data is empty (no frontmatter delimiters)', () => {
    const out = serializeMarkdown({}, '# Just a heading\n\nBody.');
    expect(out).toBe('# Just a heading\n\nBody.');
    // Round-trips: no frontmatter in, no frontmatter out.
    const round = splitFrontmatter(out);
    expect(round.data).toEqual({});
    expect(round.body).toBe('# Just a heading\n\nBody.');
  });

  it('round-trips nested structures', () => {
    const data = {
      seller: { name: 'Sample Co.' },
      items: [
        { name: 'A', price: 100 },
        { name: 'B', price: 200 },
      ],
    };
    const round = splitFrontmatter(serializeMarkdown(data, 'body'));
    expect(round.data).toMatchObject(data);
    expect(round.body).toBe('body');
  });

  it('does not fold long string values across lines (stable single-line scalars)', () => {
    const longValue = 'x'.repeat(200);
    const out = serializeMarkdown({ note: longValue }, 'body');
    // js-yaml default lineWidth=80 would wrap; we disable folding so the value
    // survives a round-trip byte-for-byte and diffs stay clean.
    expect(out).toContain(longValue);
    const round = splitFrontmatter(out);
    expect(round.data['note']).toBe(longValue);
  });

  it('handles an empty body with non-empty data', () => {
    const out = serializeMarkdown({ title: 'X' }, '');
    expect(out).toBe('---\ntitle: X\n---\n');
    const round = splitFrontmatter(out);
    expect(round.data).toEqual({ title: 'X' });
    expect(round.body).toBe('');
  });

  it('serializes Japanese values without escaping (UTF-8 passthrough)', () => {
    const out = serializeMarkdown({ title: '請求書' }, '本文');
    expect(out).toBe('---\ntitle: 請求書\n---\n本文');
  });
});
