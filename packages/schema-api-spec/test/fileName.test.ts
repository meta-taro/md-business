import { describe, it, expect } from 'vitest';
import { renderApiSpecFileName } from '../src/index.js';
import type { ApiSpec } from '../src/index.js';

function buildApiSpec(overrides: Partial<ApiSpec> = {}): ApiSpec {
  return {
    schema: 'api-spec/v1',
    documentNumber: 'API-2026-001',
    title: '受発注 API 詳細設計',
    version: '0.1.0',
    issueDate: '2026-07-15',
    status: 'draft',
    protocol: 'rest',
    auth: 'bearer',
    authors: [{ name: '田中' }],
    endpoints: [
      { operationId: 'listUsers', method: 'GET', path: '/users', responses: [{ status: 200 }] },
    ],
    ...overrides,
  };
}

describe('renderApiSpecFileName — default template', () => {
  it('uses API設計書_{文書番号}_v{版} when no template is given', () => {
    expect(renderApiSpecFileName(buildApiSpec())).toBe('API設計書_API-2026-001_v0.1.0');
  });

  it('falls back to the default template for a blank template string', () => {
    expect(renderApiSpecFileName(buildApiSpec(), '   ')).toBe('API設計書_API-2026-001_v0.1.0');
  });
});

describe('renderApiSpecFileName — tokens', () => {
  it('substitutes both Japanese and English tokens', () => {
    const tpl = '{タイトル}_{status}_{プロトコル}';
    expect(renderApiSpecFileName(buildApiSpec(), tpl)).toBe('受発注 API 詳細設計_draft_rest');
  });

  it('renders issueDate with and without dashes', () => {
    expect(renderApiSpecFileName(buildApiSpec(), '{発行日}')).toBe('2026-07-15');
    expect(renderApiSpecFileName(buildApiSpec(), '{発行日YMD}')).toBe('20260715');
    expect(renderApiSpecFileName(buildApiSpec(), '{issueYMD}')).toBe('20260715');
  });

  it('resolves an unknown token to an empty string', () => {
    expect(renderApiSpecFileName(buildApiSpec(), 'x{不明トークン}y')).toBe('xy');
  });

  it('resolves a {__proto__} token to empty (no prototype leak)', () => {
    expect(renderApiSpecFileName(buildApiSpec(), 'a{__proto__}b')).toBe('ab');
  });

  it('resolves tokens to empty strings when the underlying fields are absent', () => {
    // A partially-populated object (as can happen mid-authoring before Ajv
    // validation) must not throw — absent fields fall back to ''.
    const partial = { documentNumber: 'API-9' } as unknown as ApiSpec;
    const tpl = '{文書番号}{タイトル}{版}{ステータス}{プロトコル}{発行日}{発行日YMD}';
    expect(renderApiSpecFileName(partial, tpl)).toBe('API-9');
  });
});

describe('renderApiSpecFileName — sanitization', () => {
  it('replaces Windows-forbidden characters with underscore', () => {
    const spec = buildApiSpec({ documentNumber: 'API/2026:001' });
    expect(renderApiSpecFileName(spec, '{文書番号}')).toBe('API_2026_001');
  });

  it('strips control characters including NUL', () => {
    const nul = String.fromCharCode(0);
    const soh = String.fromCharCode(1);
    const spec = buildApiSpec({ title: `a${nul}b${soh}c` });
    expect(renderApiSpecFileName(spec, '{タイトル}')).toBe('a_b_c');
  });

  it('falls back to untitled when the rendered name is empty', () => {
    const spec = buildApiSpec({ documentNumber: '' });
    expect(renderApiSpecFileName(spec, '{文書番号}')).toBe('untitled');
  });

  it('prefixes a Windows reserved device name with underscore', () => {
    const spec = buildApiSpec({ documentNumber: 'CON' });
    expect(renderApiSpecFileName(spec, '{文書番号}')).toBe('_CON');
  });
});
