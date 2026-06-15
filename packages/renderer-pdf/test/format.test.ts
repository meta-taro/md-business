import { describe, it, expect } from 'vitest';
import { formatJpy, formatNumber, formatDateIso } from '../src/format.js';

describe('formatJpy', () => {
  it('formats integers as JPY without decimals', () => {
    expect(formatJpy(550000)).toMatch(/￥|¥/);
    expect(formatJpy(550000)).toMatch(/550,000/);
  });

  it('handles zero', () => {
    expect(formatJpy(0)).toMatch(/0/);
  });
});

describe('formatNumber', () => {
  it('groups by thousands', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('preserves up to 2 decimals', () => {
    expect(formatNumber(1.5)).toBe('1.5');
  });
});

describe('formatDateIso', () => {
  it('renders YYYY-MM-DD as Japanese date', () => {
    expect(formatDateIso('2026-06-30')).toBe('2026年06月30日');
  });

  it('returns the input unchanged for non-ISO values', () => {
    expect(formatDateIso('not-a-date')).toBe('not-a-date');
  });
});
