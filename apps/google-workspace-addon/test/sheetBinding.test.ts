import { describe, expect, it } from 'vitest';

import {
  bindingPropertyKey,
  buildBindingSummary,
  countFilledRows,
  upsertRepositoryField,
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

describe('countFilledRows', () => {
  it('returns 0 for an empty range', () => {
    expect(countFilledRows([])).toBe(0);
  });

  it('does not count rows that only have untouched checkboxes / empty cells', () => {
    // テンプレセットアップ直後: checkbox 列の false が全行に入り getLastRow が伸びる。
    // false と空文字だけの行は「記入済み」に数えない（実機で全 999 項目と誤表示した回帰）。
    const rows = [
      ['', '', '', '', '', false, ''],
      ['', '', '', '', '', false, ''],
    ];
    expect(countFilledRows(rows)).toBe(0);
  });

  it('counts rows that have text / number / true / Date content', () => {
    const rows = [
      ['ログイン成功', '', '', '', '', false, ''],
      ['', '', '', '', 3, false, ''],
      ['', '', '', '', '', true, ''],
      ['', '', '', new Date(2026, 5, 1), '', false, ''],
      ['   ', '', '', '', '', false, ''],
    ];
    expect(countFilledRows(rows)).toBe(4);
  });
});

describe('upsertRepositoryField', () => {
  it('replaces an existing repository line', () => {
    const result = upsertRepositoryField(SAMPLE, 'meta-taro/other@develop:docs/a.md');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unexpected');
    expect(result.newSrc).toContain('repository: meta-taro/other@develop:docs/a.md');
    expect(result.newSrc).not.toContain('repository: meta-taro/md-business@main');
    expect(result.repo.owner).toBe('meta-taro');
    // 本文（表）は温存
    expect(result.newSrc).toContain('| ログイン成功 | OK |');
  });

  it('replaces the commented "# repository:" hint line from the full template', () => {
    const src = [
      '---',
      'schema: test-spec/v1',
      'title: 検証シート',
      '# repository: owner/repo@branch:path   # 「GitHub に push」を使う場合はコメントを外して自分の repo に書き換え',
      'columns:',
      '  - { name: 項目, type: text }',
      '---',
    ].join('\n');
    const result = upsertRepositoryField(src, 'meta-taro/md-business@main:docs/x.md');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unexpected');
    expect(result.newSrc).toContain('repository: meta-taro/md-business@main:docs/x.md');
    expect(result.newSrc).not.toContain('# repository:');
  });

  it('inserts after the schema line when no repository line exists (Japanese keys too)', () => {
    const src = [
      '---',
      'スキーマ: test-spec/v1',
      'タイトル: 検証シート',
      '列定義:',
      '  - { 名前: 項目, 型: 文字列 }',
      '---',
      '',
      '| 項目 |',
      '| --- |',
    ].join('\n');
    const result = upsertRepositoryField(src, 'meta-taro/md-business@main:docs/x.md');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unexpected');
    const lines = result.newSrc.split('\n');
    expect(lines[1]).toBe('スキーマ: test-spec/v1');
    expect(lines[2]).toBe('repository: meta-taro/md-business@main:docs/x.md');
  });

  it('rejects malformed repo input with a human-readable Japanese error', () => {
    const result = upsertRepositoryField(SAMPLE, 'ただの文字列');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unexpected');
    expect(result.error).toContain('owner/repo@branch:path');
  });

  it('rejects sources without frontmatter', () => {
    const result = upsertRepositoryField('# 見出しだけ\n', 'a/b@main:c.md');
    expect(result.ok).toBe(false);
  });
});
