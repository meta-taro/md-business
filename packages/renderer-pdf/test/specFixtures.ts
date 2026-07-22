import type { Spec } from '@md-business/schema-spec';

export function standardSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    schemaVersion: 'spec/v1',
    documentNumber: 'SPEC-2026-0001',
    title: '受発注システム 基本設計書',
    version: '1.0.0',
    issueDate: '2026-06-17',
    status: 'review',
    authors: [
      { name: '伊藤 太郎', role: 'PdM' },
      { name: '山田 花子', role: 'テックリード' },
    ],
    reviewers: [{ name: '佐藤 太郎', role: '部長' }],
    relatedDocs: ['/docs/requirements.md', '/docs/architecture.md'],
    theme: 'blue',
    toc: 'auto',
    ...overrides,
  };
}

export function minimalSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    schemaVersion: 'spec/v1',
    documentNumber: 'SPEC-MIN-001',
    title: '最小仕様書',
    version: '0.1.0',
    issueDate: '2026-06-17',
    status: 'draft',
    authors: [{ name: '担当者' }],
    ...overrides,
  };
}
