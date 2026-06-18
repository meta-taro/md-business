import { describe, it, expect } from 'vitest';
import { renderTestSpecFileName } from '../src/index.js';
import type { TestSpec } from '../src/index.js';

function buildTestSpec(overrides: Partial<TestSpec> = {}): TestSpec {
  return {
    schema: 'test-spec/v1',
    documentNumber: 'TEST-2026-001',
    title: 'ログイン機能 検証シート',
    version: '0.1.0',
    issueDate: '2026-06-18',
    status: 'draft',
    authors: [{ name: '田中' }],
    columns: [{ name: '項目', type: 'text' }],
    ...overrides,
  };
}

describe('renderTestSpecFileName — defaults', () => {
  it('uses the default template when none is provided', () => {
    const name = renderTestSpecFileName(buildTestSpec());
    expect(name).toBe('検証シート_TEST-2026-001_v0.1.0');
  });

  it('uses the default template for an empty / whitespace template', () => {
    expect(renderTestSpecFileName(buildTestSpec(), '')).toBe('検証シート_TEST-2026-001_v0.1.0');
    expect(renderTestSpecFileName(buildTestSpec(), '   ')).toBe('検証シート_TEST-2026-001_v0.1.0');
  });
});

describe('renderTestSpecFileName — Japanese tokens', () => {
  it('substitutes {タイトル} {版} {ステータス}', () => {
    const name = renderTestSpecFileName(buildTestSpec(), '{タイトル}_{版}_{ステータス}');
    expect(name).toBe('ログイン機能 検証シート_0.1.0_draft');
  });

  it('substitutes {文書番号}', () => {
    const name = renderTestSpecFileName(buildTestSpec(), '{文書番号}');
    expect(name).toBe('TEST-2026-001');
  });

  it('substitutes {発行日} and {発行日YMD}', () => {
    const name = renderTestSpecFileName(buildTestSpec(), '{発行日}_{発行日YMD}');
    expect(name).toBe('2026-06-18_20260618');
  });
});

describe('renderTestSpecFileName — English tokens', () => {
  it('substitutes English aliases', () => {
    const name = renderTestSpecFileName(
      buildTestSpec(),
      '{documentNumber}_{title}_v{version}_{status}_{issueDate}',
    );
    expect(name).toBe('TEST-2026-001_ログイン機能 検証シート_v0.1.0_draft_2026-06-18');
  });

  it('substitutes {issueYMD}', () => {
    const name = renderTestSpecFileName(buildTestSpec(), '{issueYMD}');
    expect(name).toBe('20260618');
  });
});

describe('renderTestSpecFileName — today tokens', () => {
  it('renders {YMD} as 8 digits', () => {
    const name = renderTestSpecFileName(buildTestSpec(), '{YMD}');
    expect(name).toMatch(/^\d{8}$/);
  });

  it('renders {date} and {今日} as YYYY-MM-DD', () => {
    expect(renderTestSpecFileName(buildTestSpec(), '{date}')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(renderTestSpecFileName(buildTestSpec(), '{今日}')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('renderTestSpecFileName — sanitization', () => {
  it('replaces Windows-forbidden characters with underscore', () => {
    const name = renderTestSpecFileName(buildTestSpec({ title: 'a/b:c*d?e"f<g>h|i' }), '{タイトル}');
    expect(name).toBe('a_b_c_d_e_f_g_h_i');
  });

  it('replaces backslash and control chars', () => {
    const name = renderTestSpecFileName(buildTestSpec({ title: 'a\\b\rc\nd\te' }), '{タイトル}');
    expect(name).not.toMatch(/[\\/\r\n\t]/);
  });

  it('collapses repeated underscores from empty tokens', () => {
    const name = renderTestSpecFileName(buildTestSpec(), 'A{missing}{missing}B');
    expect(name).toBe('AB');
  });

  it('drops unknown tokens silently', () => {
    const name = renderTestSpecFileName(buildTestSpec(), '{unknown}_{タイトル}');
    expect(name).toBe('ログイン機能 検証シート');
  });

  it('trims leading and trailing underscores / dots / whitespace', () => {
    const name = renderTestSpecFileName(buildTestSpec(), '   ___{タイトル}___  ');
    expect(name).toBe('ログイン機能 検証シート');
  });
});
