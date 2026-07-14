import { describe, it, expect } from 'vitest';
import { renderDbSpecFileName } from '../src/index.js';
import type { DbSpec } from '../src/index.js';

function buildDbSpec(overrides: Partial<DbSpec> = {}): DbSpec {
  return {
    schema: 'db-spec/v1',
    documentNumber: 'DB-2026-001',
    title: '受発注ワークフロー DB 設計',
    version: '0.1.0',
    issueDate: '2026-06-26',
    status: 'draft',
    engine: 'postgres',
    authors: [{ name: '田中' }],
    tables: [{ name: 'users', columns: [{ name: 'id', type: 'bigserial' }] }],
    ...overrides,
  };
}

describe('renderDbSpecFileName — defaults', () => {
  it('uses the default template when none is provided', () => {
    const name = renderDbSpecFileName(buildDbSpec());
    expect(name).toBe('DB設計書_DB-2026-001_v0.1.0');
  });

  it('uses the default template for an empty / whitespace template', () => {
    expect(renderDbSpecFileName(buildDbSpec(), '')).toBe('DB設計書_DB-2026-001_v0.1.0');
    expect(renderDbSpecFileName(buildDbSpec(), '   ')).toBe('DB設計書_DB-2026-001_v0.1.0');
  });
});

describe('renderDbSpecFileName — Japanese tokens', () => {
  it('substitutes {タイトル} {版} {ステータス}', () => {
    const name = renderDbSpecFileName(buildDbSpec(), '{タイトル}_{版}_{ステータス}');
    expect(name).toBe('受発注ワークフロー DB 設計_0.1.0_draft');
  });

  it('substitutes {文書番号} and {エンジン}', () => {
    const name = renderDbSpecFileName(buildDbSpec(), '{文書番号}_{エンジン}');
    expect(name).toBe('DB-2026-001_postgres');
  });

  it('substitutes {発行日} and {発行日YMD}', () => {
    const name = renderDbSpecFileName(buildDbSpec(), '{発行日}_{発行日YMD}');
    expect(name).toBe('2026-06-26_20260626');
  });
});

describe('renderDbSpecFileName — English tokens', () => {
  it('substitutes English aliases', () => {
    const name = renderDbSpecFileName(
      buildDbSpec(),
      '{documentNumber}_v{version}_{status}_{engine}_{issueDate}',
    );
    expect(name).toBe('DB-2026-001_v0.1.0_draft_postgres_2026-06-26');
  });

  it('substitutes {issueYMD}', () => {
    const name = renderDbSpecFileName(buildDbSpec(), '{issueYMD}');
    expect(name).toBe('20260626');
  });
});

describe('renderDbSpecFileName — today tokens', () => {
  it('renders {YMD} as 8 digits', () => {
    const name = renderDbSpecFileName(buildDbSpec(), '{YMD}');
    expect(name).toMatch(/^\d{8}$/);
  });

  it('renders {date} and {今日} as YYYY-MM-DD', () => {
    expect(renderDbSpecFileName(buildDbSpec(), '{date}')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(renderDbSpecFileName(buildDbSpec(), '{今日}')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('renderDbSpecFileName — sanitization', () => {
  it('replaces Windows-forbidden characters with underscore', () => {
    const name = renderDbSpecFileName(buildDbSpec({ title: 'a/b:c*d?e"f<g>h|i' }), '{タイトル}');
    expect(name).toBe('a_b_c_d_e_f_g_h_i');
  });

  it('collapses repeated underscores from empty tokens', () => {
    const name = renderDbSpecFileName(buildDbSpec(), 'A{missing}{missing}B');
    expect(name).toBe('AB');
  });

  it('drops unknown tokens silently', () => {
    const name = renderDbSpecFileName(buildDbSpec(), '{unknown}_{文書番号}');
    expect(name).toBe('DB-2026-001');
  });

  it('trims leading and trailing underscores / dots / whitespace', () => {
    const name = renderDbSpecFileName(buildDbSpec(), '   ___{文書番号}___  ');
    expect(name).toBe('DB-2026-001');
  });

  it('renders empty strings for fields absent at runtime', () => {
    const sparse = { tables: [] } as unknown as DbSpec;
    const name = renderDbSpecFileName(
      sparse,
      'X{文書番号}{タイトル}{版}{ステータス}{エンジン}{発行日}{発行日YMD}Y',
    );
    expect(name).toBe('XY');
  });
});

describe('renderDbSpecFileName — security hardening', () => {
  it('strips NUL and C0 control characters from the rendered name', () => {
    const title = `a${String.fromCharCode(0)}b${String.fromCharCode(1)}c${String.fromCharCode(127)}d`;
    const name = renderDbSpecFileName(buildDbSpec({ title }), '{タイトル}');
    expect(name).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(name).toBe('a_b_c_d');
  });

  it('avoids Windows reserved device names by prefixing an underscore', () => {
    expect(renderDbSpecFileName(buildDbSpec({ documentNumber: 'CON' }), '{文書番号}')).toBe('_CON');
    expect(renderDbSpecFileName(buildDbSpec({ documentNumber: 'nul' }), '{文書番号}')).toBe('_nul');
    expect(renderDbSpecFileName(buildDbSpec({ documentNumber: 'COM1' }), '{文書番号}')).toBe('_COM1');
    expect(renderDbSpecFileName(buildDbSpec({ documentNumber: 'LPT9' }), '{文書番号}')).toBe('_LPT9');
  });

  it('does not treat non-reserved names as reserved', () => {
    expect(renderDbSpecFileName(buildDbSpec({ documentNumber: 'console' }), '{文書番号}')).toBe('console');
    expect(renderDbSpecFileName(buildDbSpec({ documentNumber: 'COM0' }), '{文書番号}')).toBe('COM0');
  });

  it('falls back to a default when the sanitized name is empty', () => {
    expect(renderDbSpecFileName(buildDbSpec(), '///')).toBe('untitled');
    expect(renderDbSpecFileName(buildDbSpec(), '...')).toBe('untitled');
  });

  it('does not resolve {__proto__} to a stringified prototype', () => {
    const name = renderDbSpecFileName(buildDbSpec(), 'A{__proto__}B');
    expect(name).toBe('AB');
  });
});
