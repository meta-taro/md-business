import { describe, expect, it } from 'vitest';
import validateTestSpec from '@md-business/schema-test-spec/validate';

import { buildPushPlan } from '../src/lib/pushTestSpec.js';

const VALID_MD = `---
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
---

## 検証ケース

| 項目 | 結果 |
| --- | --- |
| 既存 | OK |
`;

describe('buildPushPlan', () => {
  it('returns ok with repoRef + markdown + commitMessage when valid', () => {
    const result = buildPushPlan({
      markdownSource: VALID_MD,
      sheetValues: [
        ['項目', '結果'],
        ['ログイン成功', 'OK'],
      ],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-23T09:30:00Z',
      validate: validateTestSpec,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repoRef).toEqual({
        owner: 'meta-taro',
        repo: 'md-business',
        branch: 'main',
        path: 'verify/login.md',
      });
      expect(result.markdown).toContain('| 項目 | 結果 |');
      expect(result.markdown).toContain('| ログイン成功 | OK |');
      expect(result.commitMessage).toBe(
        'chore(test-spec): sync TEST-2026-001 from "Sheet1" — 2026-06-23T09:30:00Z',
      );
    }
  });

  it('returns error when frontmatter cannot be parsed', () => {
    const result = buildPushPlan({
      markdownSource: 'no frontmatter here',
      sheetValues: [],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-23T09:30:00Z',
      validate: validateTestSpec,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it('returns error when repository field is missing', () => {
    const noRepo = VALID_MD.replace(
      /^repository: .*$/m,
      '',
    );
    const result = buildPushPlan({
      markdownSource: noRepo,
      sheetValues: [
        ['項目', '結果'],
        ['x', 'OK'],
      ],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-23T09:30:00Z',
      validate: validateTestSpec,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/repository/);
    }
  });

  it('returns error when repository is malformed', () => {
    const badRepo = VALID_MD.replace(
      'repository: meta-taro/md-business@main:verify/login.md',
      'repository: invalid-string',
    );
    const result = buildPushPlan({
      markdownSource: badRepo,
      sheetValues: [
        ['項目', '結果'],
        ['x', 'OK'],
      ],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-23T09:30:00Z',
      validate: validateTestSpec,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/repository|owner\/repo/);
    }
  });

  it('returns error with validationIssues when sheet has enum_out_of_values', () => {
    const result = buildPushPlan({
      markdownSource: VALID_MD,
      sheetValues: [
        ['項目', '結果'],
        ['ログイン失敗', '保留'],
      ],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-23T09:30:00Z',
      validate: validateTestSpec,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.validationIssues).toBeDefined();
      expect(result.validationIssues?.length ?? 0).toBeGreaterThan(0);
      expect(result.validationIssues?.[0]?.kind).toBe('enum_out_of_values');
    }
  });

  it('uses customMessage verbatim when provided', () => {
    const result = buildPushPlan({
      markdownSource: VALID_MD,
      sheetValues: [
        ['項目', '結果'],
        ['ログイン成功', 'OK'],
      ],
      sheetName: 'Sheet1',
      isoTimestamp: '2026-06-23T09:30:00Z',
      validate: validateTestSpec,
      customMessage: 'fix: typo in row 3',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commitMessage).toBe('fix: typo in row 3');
    }
  });
});
