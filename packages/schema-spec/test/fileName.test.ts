import { describe, it, expect } from 'vitest';
import { renderSpecFileName } from '../src/index.js';
import type { Spec } from '../src/index.js';

function buildSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    schemaVersion: 'spec/v1',
    documentNumber: 'SPEC-2026-001',
    title: '注文管理サブシステム',
    version: '0.1.0',
    issueDate: '2026-06-17',
    status: 'draft',
    authors: [{ name: '田中' }],
    ...overrides,
  };
}

describe('renderSpecFileName — defaults', () => {
  it('uses the default template when none is provided', () => {
    const name = renderSpecFileName(buildSpec());
    expect(name).toBe('基本設計書_SPEC-2026-001_v0.1.0');
  });

  it('uses the default template for an empty / whitespace template', () => {
    expect(renderSpecFileName(buildSpec(), '')).toBe('基本設計書_SPEC-2026-001_v0.1.0');
    expect(renderSpecFileName(buildSpec(), '   ')).toBe('基本設計書_SPEC-2026-001_v0.1.0');
  });
});

describe('renderSpecFileName — Japanese tokens', () => {
  it('substitutes {タイトル} {版} {ステータス}', () => {
    const name = renderSpecFileName(buildSpec(), '{タイトル}_{版}_{ステータス}');
    expect(name).toBe('注文管理サブシステム_0.1.0_draft');
  });

  it('substitutes {文書番号}', () => {
    const name = renderSpecFileName(buildSpec(), '{文書番号}');
    expect(name).toBe('SPEC-2026-001');
  });

  it('substitutes {発行日} and {発行日YMD}', () => {
    const name = renderSpecFileName(buildSpec(), '{発行日}_{発行日YMD}');
    expect(name).toBe('2026-06-17_20260617');
  });
});

describe('renderSpecFileName — English tokens', () => {
  it('substitutes English aliases', () => {
    const name = renderSpecFileName(
      buildSpec(),
      '{documentNumber}_{title}_v{version}_{status}_{issueDate}',
    );
    expect(name).toBe('SPEC-2026-001_注文管理サブシステム_v0.1.0_draft_2026-06-17');
  });

  it('substitutes {issueYMD}', () => {
    const name = renderSpecFileName(buildSpec(), '{issueYMD}');
    expect(name).toBe('20260617');
  });
});

describe('renderSpecFileName — today tokens', () => {
  it('renders {YMD} as 8 digits', () => {
    const name = renderSpecFileName(buildSpec(), '{YMD}');
    expect(name).toMatch(/^\d{8}$/);
  });

  it('renders {date} and {今日} as YYYY-MM-DD', () => {
    expect(renderSpecFileName(buildSpec(), '{date}')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(renderSpecFileName(buildSpec(), '{今日}')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('renderSpecFileName — sanitization', () => {
  it('replaces Windows-forbidden characters with underscore', () => {
    const name = renderSpecFileName(buildSpec({ title: 'a/b:c*d?e"f<g>h|i' }), '{タイトル}');
    expect(name).toBe('a_b_c_d_e_f_g_h_i');
  });

  it('replaces backslash and control chars', () => {
    const name = renderSpecFileName(buildSpec({ title: 'a\\b\rc\nd\te' }), '{タイトル}');
    expect(name).not.toMatch(/[\\/\r\n\t]/);
  });

  it('collapses repeated underscores from empty tokens', () => {
    const name = renderSpecFileName(buildSpec(), 'A{missing}{missing}B');
    expect(name).toBe('AB');
  });

  it('drops unknown tokens silently', () => {
    const name = renderSpecFileName(buildSpec(), '{unknown}_{タイトル}');
    expect(name).toBe('注文管理サブシステム');
  });

  it('trims leading and trailing underscores / dots / whitespace', () => {
    const name = renderSpecFileName(buildSpec(), '   ___{タイトル}___  ');
    expect(name).toBe('注文管理サブシステム');
  });
});
