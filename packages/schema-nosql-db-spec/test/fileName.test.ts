import { describe, it, expect } from 'vitest';
import { renderNosqlDbSpecFileName } from '../src/index.js';
import type { NosqlDbSpec } from '../src/index.js';

const SPEC: NosqlDbSpec = {
  schema: 'nosql-db-spec/v1',
  documentNumber: 'NDB-2026-001',
  title: 'ユーザーストア設計',
  version: '0.1.0',
  issueDate: '2026-07-02',
  status: 'draft',
  engine: 'firestore',
  authors: [{ name: '田中' }],
  collections: [
    {
      path: 'users',
      docIdStrategy: 'auth-uid',
      shape: { displayName: { type: 'string' } },
    },
  ],
};

describe('renderNosqlDbSpecFileName — default template', () => {
  it('renders NoSQL設計書_{文書番号}_v{版}', () => {
    expect(renderNosqlDbSpecFileName(SPEC)).toBe('NoSQL設計書_NDB-2026-001_v0.1.0');
  });

  it('falls back to the default for empty / whitespace templates', () => {
    expect(renderNosqlDbSpecFileName(SPEC, '')).toBe('NoSQL設計書_NDB-2026-001_v0.1.0');
    expect(renderNosqlDbSpecFileName(SPEC, '   ')).toBe('NoSQL設計書_NDB-2026-001_v0.1.0');
  });
});

describe('renderNosqlDbSpecFileName — tokens', () => {
  it('substitutes Japanese tokens', () => {
    expect(
      renderNosqlDbSpecFileName(SPEC, '{タイトル}_{版}_{ステータス}_{文書番号}_{エンジン}_{発行日}'),
    ).toBe('ユーザーストア設計_0.1.0_draft_NDB-2026-001_firestore_2026-07-02');
  });

  it('substitutes English alias tokens', () => {
    expect(
      renderNosqlDbSpecFileName(SPEC, '{title}_{version}_{status}_{documentNumber}_{engine}_{issueDate}'),
    ).toBe('ユーザーストア設計_0.1.0_draft_NDB-2026-001_firestore_2026-07-02');
  });

  it('renders 発行日YMD without dashes', () => {
    expect(renderNosqlDbSpecFileName(SPEC, '{発行日YMD}')).toBe('20260702');
    expect(renderNosqlDbSpecFileName(SPEC, '{issueYMD}')).toBe('20260702');
  });

  it('renders today tokens as date-shaped strings', () => {
    expect(renderNosqlDbSpecFileName(SPEC, 'A{YMD}')).toMatch(/^A\d{8}$/);
    expect(renderNosqlDbSpecFileName(SPEC, 'A{date}')).toMatch(/^A\d{4}-\d{2}-\d{2}$/);
    expect(renderNosqlDbSpecFileName(SPEC, 'A{今日}')).toMatch(/^A\d{4}-\d{2}-\d{2}$/);
  });
});

describe('renderNosqlDbSpecFileName — sanitize', () => {
  it('replaces Windows-forbidden characters with underscores', () => {
    const spec = { ...SPEC, title: 'a/b:c*d?e"f<g>h|i' };
    expect(renderNosqlDbSpecFileName(spec, '{タイトル}')).toBe('a_b_c_d_e_f_g_h_i');
  });

  it('drops unknown tokens and collapses leftovers', () => {
    expect(renderNosqlDbSpecFileName(SPEC, 'A{missing}{missing}B')).toBe('AB');
  });

  it('trims leading/trailing underscores', () => {
    expect(renderNosqlDbSpecFileName(SPEC, '_{missing}_X_')).toBe('X');
  });

  it('tolerates a sparse object', () => {
    const sparse = { collections: [] } as unknown as NosqlDbSpec;
    expect(renderNosqlDbSpecFileName(sparse, 'X{文書番号}{タイトル}{版}{エンジン}Y')).toBe('XY');
  });
});
