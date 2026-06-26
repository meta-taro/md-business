import { describe, expect, it } from 'vitest';

import { prepareAutoSyncCommit } from '../src/lib/autoSync.js';
import type { TestSpec } from '@md-business/schema-test-spec';

const FRONTMATTER_BLOCK = `---
schema: test-spec/v1
documentNumber: TEST-2026-001
title: ログイン機能 検証シート
version: 0.1.0
issueDate: 2026-06-18
status: draft
authors:
  - name: 田中
columns:
  - { name: 項目, type: text }
  - { name: 結果, type: enum, values: [OK, NG] }
repository: meta-taro/md-business@main:verify/login.md
---`;

function buildSpec(overrides: Partial<TestSpec> = {}): TestSpec {
  return {
    schema: 'test-spec/v1',
    documentNumber: 'TEST-2026-001',
    title: 'ログイン機能 検証シート',
    version: '0.1.0',
    issueDate: '2026-06-18',
    status: 'draft',
    authors: [{ name: '田中' }],
    columns: [
      { name: '項目', type: 'text' },
      { name: '結果', type: 'enum', values: ['OK', 'NG'] },
    ],
    repository: 'meta-taro/md-business@main:verify/login.md',
    ...overrides,
  };
}

function buildSpecWithoutRepository(): TestSpec {
  const spec = buildSpec();
  const { repository: _repository, ...rest } = spec;
  return rest;
}

describe('prepareAutoSyncCommit', () => {
  it('returns skip(no_repository) when spec.repository is missing', () => {
    const spec = buildSpecWithoutRepository();
    const result = prepareAutoSyncCommit({
      spec,
      sheetValues: [['項目', '結果'], ['ログイン成功', 'OK']],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-18T09:30:00Z',
      frontmatterBlock: FRONTMATTER_BLOCK,
    });
    expect(result).toEqual({ kind: 'skip', reason: 'no_repository' });
  });

  it('returns skip(no_repository) when spec.repository is malformed (after parseRepoRef rejection)', () => {
    const spec = buildSpec({ repository: 'invalid' });
    const result = prepareAutoSyncCommit({
      spec,
      sheetValues: [['項目', '結果'], ['x', 'OK']],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-18T09:30:00Z',
      frontmatterBlock: FRONTMATTER_BLOCK,
    });
    expect(result.kind).toBe('skip');
    if (result.kind === 'skip') expect(result.reason).toBe('no_repository');
  });

  it('returns skip(validation_failed) with issues when sheet has enum_out_of_values', () => {
    const spec = buildSpec();
    const result = prepareAutoSyncCommit({
      spec,
      sheetValues: [
        ['項目', '結果'],
        ['ログイン成功', 'OK'],
        ['ログイン失敗', '保留'],
      ],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-18T09:30:00Z',
      frontmatterBlock: FRONTMATTER_BLOCK,
    });
    expect(result.kind).toBe('skip');
    if (result.kind === 'skip') {
      expect(result.reason).toBe('validation_failed');
      const issues = result.validationIssues;
      expect(issues).toBeDefined();
      if (issues) {
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]?.kind).toBe('enum_out_of_values');
      }
    }
  });

  it('returns proceed with repoRef, markdown, commitMessage when sheet is valid', () => {
    const spec = buildSpec();
    const result = prepareAutoSyncCommit({
      spec,
      sheetValues: [
        ['項目', '結果'],
        ['ログイン成功', 'OK'],
      ],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-18T09:30:00Z',
      frontmatterBlock: FRONTMATTER_BLOCK,
    });
    expect(result.kind).toBe('proceed');
    if (result.kind === 'proceed') {
      expect(result.repoRef).toEqual({
        owner: 'meta-taro',
        repo: 'md-business',
        branch: 'main',
        path: 'verify/login.md',
      });
      expect(result.markdown).toContain(FRONTMATTER_BLOCK);
      expect(result.markdown).toContain('| 項目 | 結果 |');
      expect(result.markdown).toContain('| ログイン成功 | OK |');
      expect(result.commitMessage).toBe(
        'chore(test-spec): sync TEST-2026-001 from "Sheet1" — 2026-06-18T09:30:00Z',
      );
    }
  });

  it('trims trailing Sheets default empty rows before validation and md export (Issue #44)', () => {
    // checkbox 列を含む spec で、本文 1 行 + Sheets デフォルト空行 1000 行
    const spec: TestSpec = {
      schema: 'test-spec/v1',
      documentNumber: 'TEST-2026-001',
      title: 'ログイン機能 検証シート',
      version: '0.1.0',
      issueDate: '2026-06-18',
      status: 'draft',
      authors: [{ name: '田中' }],
      columns: [
        { name: '項目', type: 'text' },
        { name: '結果', type: 'enum', values: ['OK', 'NG'] },
        { name: '完了', type: 'checkbox' },
      ],
      repository: 'meta-taro/md-business@main:verify/login.md',
    };
    const emptyRow: ReadonlyArray<unknown> = ['', '', false];
    const sheetValues: ReadonlyArray<ReadonlyArray<unknown>> = [
      ['項目', '結果', '完了'],
      ['ログイン成功', 'OK', true],
      ...Array.from({ length: 1000 }, () => emptyRow),
    ];
    const result = prepareAutoSyncCommit({
      spec,
      sheetValues,
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-25T09:30:00Z',
      frontmatterBlock: FRONTMATTER_BLOCK,
    });
    expect(result.kind).toBe('proceed');
    if (result.kind === 'proceed') {
      // markdown は header + separator + 1 行のみで終わる（空 row が trim されている）
      const tableLines = result.markdown
        .split('\n')
        .filter((l) => l.startsWith('|'));
      expect(tableLines).toEqual([
        '| 項目 | 結果 | 完了 |',
        '| --- | --- | --- |',
        '| ログイン成功 | OK | true |',
      ]);
      // checkbox の false が enum_out_of_values で誤検知されないことも回帰防止
      expect(result.markdown).not.toContain('|  |  |  | false |');
    }
  });

  it('uses customMessage verbatim when provided', () => {
    const spec = buildSpec();
    const result = prepareAutoSyncCommit({
      spec,
      sheetValues: [['項目', '結果'], ['x', 'OK']],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-18T09:30:00Z',
      frontmatterBlock: FRONTMATTER_BLOCK,
      customMessage: 'fix: typo in row 3',
    });
    if (result.kind === 'proceed') {
      expect(result.commitMessage).toBe('fix: typo in row 3');
    } else {
      throw new Error('expected proceed');
    }
  });
});

