import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../src/parse.js';

describe('parseMarkdown', () => {
  it('extracts frontmatter and body from a markdown string', () => {
    const src = `---
title: Hello
amount: 1000
---

# Body

Lorem ipsum.`;
    const result = parseMarkdown(src);
    expect(result.data).toEqual({ title: 'Hello', amount: 1000 });
    expect(result.body).toContain('# Body');
    expect(result.body).toContain('Lorem ipsum.');
  });

  it('returns empty frontmatter object when markdown has no frontmatter', () => {
    const result = parseMarkdown('# Just body');
    expect(result.data).toEqual({});
    expect(result.body).toContain('# Just body');
  });

  it('returns an mdast Root node with parsed children', () => {
    const result = parseMarkdown('# Hello\n\nWorld');
    expect(result.ast.type).toBe('root');
    expect(result.ast.children.length).toBeGreaterThan(0);
  });

  it('parses date-like frontmatter values as Date or string depending on YAML', () => {
    const src = `---
issuedAt: 2026-06-30
---

body`;
    const result = parseMarkdown(src);
    expect(result.data['issuedAt']).toBeDefined();
  });

  it('preserves nested frontmatter structures', () => {
    const src = `---
seller:
  name: Sample Co.
  registrationNumber: T1234567890123
items:
  - name: Item A
    price: 1000
  - name: Item B
    price: 2000
---

body`;
    const result = parseMarkdown(src);
    expect(result.data).toMatchObject({
      seller: { name: 'Sample Co.', registrationNumber: 'T1234567890123' },
      items: [
        { name: 'Item A', price: 1000 },
        { name: 'Item B', price: 2000 },
      ],
    });
  });
});
