import { describe, it, expect } from 'vitest';
import { validateWith } from '../src/validate.js';

const sampleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer', minimum: 0 },
    email: { type: 'string', format: 'email' },
  },
  required: ['name'],
  additionalProperties: false,
};

describe('validateWith', () => {
  it('returns ok=true for valid data', () => {
    const result = validateWith<{ name: string }>({ name: 'taro' }, sampleSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('taro');
    }
  });

  it('returns ok=false with errors when required field is missing', () => {
    const result = validateWith({}, sampleSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.keyword).toBe('required');
    }
  });

  it('returns ok=false when integer minimum constraint is violated', () => {
    const result = validateWith({ name: 'taro', age: -1 }, sampleSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.keyword).toBe('minimum');
    }
  });

  it('returns ok=false when format constraint fails (ajv-formats wired)', () => {
    const result = validateWith({ name: 'taro', email: 'not-an-email' }, sampleSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.keyword === 'format')).toBe(true);
    }
  });

  it('returns ok=false when additional property is present', () => {
    const result = validateWith({ name: 'taro', unknown: 'x' }, sampleSchema);
    expect(result.ok).toBe(false);
  });

  it('returns errors with non-empty path for nested violations', () => {
    const nestedSchema = {
      type: 'object',
      properties: {
        seller: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      },
      required: ['seller'],
    };
    const result = validateWith({ seller: {} }, nestedSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toContain('seller');
    }
  });
});
