import { describe, it, expect } from 'vitest';
import { parseTestSpecForSidebar } from '../src/lib/parseTestSpecForSidebar.js';
import validateTestSpec from '@md-business/schema-test-spec/validate';

const MINIMAL = [
  '---',
  'schema: test-spec/v1',
  'documentNumber: TEST-2026-0001',
  'title: 検証シート',
  'issueDate: 2026-06-19',
  'authors:',
  '  - { name: 担当, role: PdM }',
  'columns:',
  '  - { name: 項目, type: text }',
  '---',
].join('\n');

describe('parseTestSpecForSidebar — empty textarea guidance', () => {
  it('returns a Japanese guidance message when the input is an empty string', () => {
    const result = parseTestSpecForSidebar('', validateTestSpec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/テンプレ|frontmatter|雛形/);
    expect(result.error).not.toMatch(/must have required property/);
  });

  it('returns the same guidance for whitespace-only input', () => {
    const result = parseTestSpecForSidebar('   \n  \t  \n', validateTestSpec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/テンプレ|frontmatter|雛形/);
  });

  it('returns the same guidance when only an empty frontmatter fence exists', () => {
    const result = parseTestSpecForSidebar('---\n---\n', validateTestSpec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/テンプレ|frontmatter|雛形/);
    expect(result.error).not.toMatch(/must have required property/);
  });
});

describe('parseTestSpecForSidebar — Japanese-translated Ajv errors', () => {
  it('translates "must have required property" into Japanese field labels', () => {
    const partial = [
      '---',
      'schema: test-spec/v1',
      'title: 検証シート',
      '---',
    ].join('\n');
    const result = parseTestSpecForSidebar(partial, validateTestSpec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/文書番号|発行日|作成者|列定義/);
    expect(result.error).not.toMatch(/must have required property/);
  });

  it('joins multiple translated errors with a separator', () => {
    const result = parseTestSpecForSidebar('---\nschema: test-spec/v1\n---', validateTestSpec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.split('\n').length).toBeGreaterThan(1);
  });
});

describe('parseTestSpecForSidebar — happy path', () => {
  it('returns ok: true with the parsed spec for a valid minimal frontmatter', () => {
    const result = parseTestSpecForSidebar(MINIMAL, validateTestSpec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.title).toBe('検証シート');
    expect(result.spec.columns).toHaveLength(1);
    expect(result.spec.columns[0]?.name).toBe('項目');
  });
});
