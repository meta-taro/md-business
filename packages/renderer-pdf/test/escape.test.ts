import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/escape.js';

describe('escapeHtml', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('returns an empty string for null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces numbers to strings', () => {
    expect(escapeHtml(123)).toBe('123');
  });

  it('passes through safe text untouched', () => {
    expect(escapeHtml('株式会社サンプル')).toBe('株式会社サンプル');
  });
});
