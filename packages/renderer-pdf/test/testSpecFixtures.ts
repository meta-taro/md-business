import type { TestSpec } from '@md-business/schema-test-spec';

export function standardTestSpec(overrides: Partial<TestSpec> = {}): TestSpec {
  return {
    schema: 'test-spec/v1',
    documentNumber: 'TEST-2026-0001',
    title: 'ログイン機能 検証シート',
    version: '0.1.0',
    issueDate: '2026-06-18',
    status: 'executing',
    authors: [
      { name: '伊藤 太郎', role: 'PdM' },
      { name: '山田 花子', role: 'QA リード' },
    ],
    reviewers: [{ name: '佐藤 太郎', role: '部長' }],
    relatedDocs: ['/docs/login-spec.md', '/docs/account-flow.md'],
    googleSheetId: '1abcDEF_sheetIdSample',
    theme: 'blue',
    columns: [
      { name: '項目', type: 'text' },
      { name: '手順', type: 'multiline_text' },
      {
        name: '結果',
        type: 'enum',
        values: ['OK', 'NG', '保留', '未実施'],
        visual: {
          NG: { row_background: '#fce8e6' },
          保留: { background: '#fef7e0' },
        },
      },
      { name: '実施日', type: 'date' },
      { name: '備考', type: 'text' },
    ],
    ...overrides,
  };
}

export function minimalTestSpec(overrides: Partial<TestSpec> = {}): TestSpec {
  return {
    schema: 'test-spec/v1',
    documentNumber: 'TEST-MIN-001',
    title: '最小検証シート',
    version: '0.1.0',
    issueDate: '2026-06-18',
    status: 'draft',
    authors: [{ name: '担当者' }],
    columns: [{ name: '項目', type: 'text' }],
    ...overrides,
  };
}
