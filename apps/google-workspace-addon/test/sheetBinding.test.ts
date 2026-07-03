import { describe, expect, it } from 'vitest';

import {
  bindingPropertyKey,
  buildBindingSummary,
} from '../src/lib/sheetBinding.js';

const SAMPLE = [
  '---',
  'schema: test-spec/v1',
  'documentNumber: TEST-2026-0001',
  'title: ログイン機能 検証シート',
  'issueDate: 2026-06-19',
  'repository: meta-taro/md-business@main:docs/test-spec/sample.md',
  'authors:',
  '  - { name: 田中, role: PdM }',
  'columns:',
  '  - { name: 項目, type: text }',
  '  - { name: 結果, type: enum, values: [OK, NG] }',
  '---',
  '',
  '| 項目 | 結果 |',
  '| --- | --- |',
  '| ログイン成功 | OK |',
].join('\n');

describe('bindingPropertyKey', () => {
  it('builds a namespaced key from the sheet id', () => {
    expect(bindingPropertyKey(123)).toBe('mdbusiness:src:123');
  });

  it('produces distinct keys for distinct sheets', () => {
    expect(bindingPropertyKey(1)).not.toBe(bindingPropertyKey(2));
  });
});

describe('buildBindingSummary', () => {
  it('extracts title / documentNumber / schema / repository from stored source', () => {
    const summary = buildBindingSummary(SAMPLE);
    expect(summary).not.toBeNull();
    if (!summary) throw new Error('unexpected null');
    expect(summary.title).toBe('ログイン機能 検証シート');
    expect(summary.documentNumber).toBe('TEST-2026-0001');
    expect(summary.schema).toBe('test-spec/v1');
    expect(summary.repository).toEqual({
      owner: 'meta-taro',
      repo: 'md-business',
      branch: 'main',
      path: 'docs/test-spec/sample.md',
    });
  });

  it('returns null repository when the repository field is absent', () => {
    const src = SAMPLE.replace(
      'repository: meta-taro/md-business@main:docs/test-spec/sample.md\n',
      '',
    );
    const summary = buildBindingSummary(src);
    expect(summary).not.toBeNull();
    expect(summary?.repository).toBeNull();
  });

  it('falls back to empty strings for missing title / documentNumber', () => {
    const src = '---\nschema: test-spec/v1\ncolumns: []\n---\n';
    const summary = buildBindingSummary(src);
    expect(summary).not.toBeNull();
    if (!summary) throw new Error('unexpected null');
    expect(summary.title).toBe('');
    expect(summary.documentNumber).toBe('');
    expect(summary.schema).toBe('test-spec/v1');
  });

  it('reads Japanese frontmatter keys (スキーマ / 文書番号 / タイトル) like sample.md', () => {
    const src = [
      '---',
      'スキーマ: test-spec/v1',
      '文書番号: TEST-2026-0002',
      'タイトル: 受発注ワークフロー 検証シート',
      'repository: meta-taro/md-business@main:docs/test-spec/sample.md',
      '列定義:',
      '  - { 名前: 項目, 型: 文字列 }',
      '---',
      '',
      '| 項目 |',
      '| --- |',
    ].join('\n');
    const summary = buildBindingSummary(src);
    expect(summary).not.toBeNull();
    if (!summary) throw new Error('unexpected null');
    expect(summary.title).toBe('受発注ワークフロー 検証シート');
    expect(summary.documentNumber).toBe('TEST-2026-0002');
    expect(summary.schema).toBe('test-spec/v1');
    expect(summary.repository?.owner).toBe('meta-taro');
  });

  it('returns null when the source has no frontmatter', () => {
    expect(buildBindingSummary('# just a heading\n')).toBeNull();
    expect(buildBindingSummary('')).toBeNull();
  });

  it('returns null when the frontmatter YAML is broken', () => {
    const src = '---\nschema: [unclosed\n---\nbody';
    expect(buildBindingSummary(src)).toBeNull();
  });
});
