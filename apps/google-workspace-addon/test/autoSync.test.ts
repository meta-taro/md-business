import { describe, expect, it } from 'vitest';

import {
  prepareAutoSyncCommit,
  parseAutoSyncState,
  serializeAutoSyncState,
  type AutoSyncState,
} from '../src/lib/autoSync.js';
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

describe('parseAutoSyncState', () => {
  it('returns idle when input is null', () => {
    expect(parseAutoSyncState(null)).toEqual<AutoSyncState>({ kind: 'idle' });
  });

  it('returns idle when input is empty string', () => {
    expect(parseAutoSyncState('')).toEqual<AutoSyncState>({ kind: 'idle' });
  });

  it('returns idle when input is invalid JSON', () => {
    expect(parseAutoSyncState('{not json')).toEqual<AutoSyncState>({ kind: 'idle' });
  });

  it('returns idle when kind is unknown', () => {
    expect(parseAutoSyncState(JSON.stringify({ kind: 'weird' }))).toEqual<AutoSyncState>({
      kind: 'idle',
    });
  });

  it('parses pending state', () => {
    const state: AutoSyncState = { kind: 'pending', lastEditAt: '2026-06-18T09:30:00Z' };
    expect(parseAutoSyncState(JSON.stringify(state))).toEqual(state);
  });

  it('parses success state', () => {
    const state: AutoSyncState = {
      kind: 'success',
      syncedAt: '2026-06-18T09:30:00Z',
      commitSha: 'abc123',
      bytes: 512,
    };
    expect(parseAutoSyncState(JSON.stringify(state))).toEqual(state);
  });

  it('parses error state with details', () => {
    const state: AutoSyncState = {
      kind: 'error',
      failedAt: '2026-06-18T09:30:00Z',
      reason: 'github_401',
      details: 'PAT 認証エラー',
    };
    expect(parseAutoSyncState(JSON.stringify(state))).toEqual(state);
  });

  it('parses error state without details', () => {
    const state = {
      kind: 'error',
      failedAt: '2026-06-18T09:30:00Z',
      reason: 'github_404',
    };
    expect(parseAutoSyncState(JSON.stringify(state))).toEqual(state);
  });
});

describe('serializeAutoSyncState', () => {
  it.each<AutoSyncState>([
    { kind: 'idle' },
    { kind: 'pending', lastEditAt: '2026-06-18T09:30:00Z' },
    {
      kind: 'success',
      syncedAt: '2026-06-18T09:30:00Z',
      commitSha: 'abc123',
      bytes: 512,
    },
    {
      kind: 'error',
      failedAt: '2026-06-18T09:30:00Z',
      reason: 'github_401',
      details: 'PAT 認証エラー',
    },
  ])('roundtrips %#', (state) => {
    expect(parseAutoSyncState(serializeAutoSyncState(state))).toEqual(state);
  });
});
