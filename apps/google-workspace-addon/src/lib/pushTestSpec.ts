import type { CompiledValidator } from '@md-business/core';

import { prepareAutoSyncCommit } from './autoSync.js';
import { extractFrontmatter } from './frontmatterEdit.js';
import type { RepoRef } from './githubApi.js';
import { parseTestSpecForSidebar } from './parseTestSpecForSidebar.js';
import type { SheetValidationIssue } from './testSpecSheetOps.js';

export type BuildPushPlanInput = {
  readonly markdownSource: string;
  readonly sheetValues: ReadonlyArray<ReadonlyArray<unknown>>;
  readonly sheetName: string;
  readonly isoTimestamp: string;
  readonly validate: CompiledValidator;
  readonly customMessage?: string;
};

export type BuildPushPlanResult =
  | {
      readonly ok: true;
      readonly repoRef: RepoRef;
      readonly markdown: string;
      readonly commitMessage: string;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly validationIssues?: ReadonlyArray<SheetValidationIssue>;
    };

/**
 * 「GitHub に push」ボタン押下時の純粋関数。
 * 引数の markdownSource + シート values から、PUT 用の repoRef / markdown /
 * commit message を組み立てる。GitHub API 呼び出し（UrlFetchApp）と
 * PropertiesService からの PAT 取得は呼び出し側 (main.ts) が担当する。
 */
export function buildPushPlan(input: BuildPushPlanInput): BuildPushPlanResult {
  const parsed = parseTestSpecForSidebar(input.markdownSource, input.validate);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  if (typeof parsed.spec.repository !== 'string' || parsed.spec.repository.length === 0) {
    return {
      ok: false,
      error:
        'frontmatter に repository が未設定です（例: repository: owner/repo@branch:path）。',
    };
  }

  const { yaml } = extractFrontmatter(input.markdownSource);
  if (yaml.length === 0) {
    return {
      ok: false,
      error: 'frontmatter ブロック (--- ... ---) を抽出できませんでした。',
    };
  }
  const frontmatterBlock = `---\n${yaml}\n---`;

  const result = prepareAutoSyncCommit({
    spec: parsed.spec,
    sheetValues: input.sheetValues,
    sheetName: input.sheetName,
    isoTimestamp: input.isoTimestamp,
    frontmatterBlock,
    ...(input.customMessage !== undefined ? { customMessage: input.customMessage } : {}),
  });

  if (result.kind === 'skip') {
    if (result.reason === 'no_repository') {
      return {
        ok: false,
        error: 'repository の形式が不正です（owner/repo@branch:path）。',
      };
    }
    return {
      ok: false,
      error: `${result.validationIssues?.length ?? 0} 件の検証エラーで push を中断しました。`,
      ...(result.validationIssues !== undefined
        ? { validationIssues: result.validationIssues }
        : {}),
    };
  }

  return {
    ok: true,
    repoRef: result.repoRef,
    markdown: result.markdown,
    commitMessage: result.commitMessage,
  };
}
