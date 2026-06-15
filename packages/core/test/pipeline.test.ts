import { describe, it, expect } from 'vitest';
import { parseAndValidate } from '../src/pipeline.js';

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    amount: { type: 'number' },
  },
  required: ['title'],
};

describe('parseAndValidate', () => {
  it('returns frontmatter, body, and ast when valid', () => {
    const src = `---
title: Hello
amount: 100
---

Body text`;
    const result = parseAndValidate<{ title: string; amount: number }>(src, schema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.frontmatter.title).toBe('Hello');
      expect(result.frontmatter.amount).toBe(100);
      expect(result.body).toContain('Body text');
      expect(result.ast.type).toBe('root');
    }
  });

  it('returns errors when frontmatter is invalid', () => {
    const src = `---
amount: 100
---

Body`;
    const result = parseAndValidate(src, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('returns errors when frontmatter is missing entirely', () => {
    const result = parseAndValidate('# No frontmatter', schema);
    expect(result.ok).toBe(false);
  });
});
