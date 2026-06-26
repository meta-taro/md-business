import type { TestSpec } from '@md-business/schema-test-spec';

import {
  extractRepoRefFromSpec,
  buildAutoCommitMessage,
  type RepoRef,
} from './githubApi.js';
import {
  applySheetValuesToSpec,
  trimTrailingEmptyRows,
  validateSheetValues,
  type SheetValidationIssue,
} from './testSpecSheetOps.js';

/**
 * test-spec push 用の「副作用ゼロ層」。
 *
 * Why: GitHub Contents API への commit は UrlFetchApp / SpreadsheetApp に
 *      深く依存するため Vitest で直接テストできない。バリデーション・
 *      markdown 構築・commit message 生成を純粋関数として切り出し、
 *      副作用層 (main.ts pushTestSpecToGithub) はこの結果を渡すだけにする。
 *      onEdit auto-sync 用に書かれた純粋関数だが、手動 push 経路でも同じ
 *      入出力で再利用できる（spec → repoRef → markdown / commitMessage）。
 */

export type AutoSyncPrepareInput = {
  readonly spec: TestSpec;
  readonly sheetValues: ReadonlyArray<ReadonlyArray<unknown>>;
  readonly sheetName: string;
  readonly isoTimestamp: string;
  readonly frontmatterBlock: string;
  readonly customMessage?: string;
};

export type AutoSyncPrepareResult =
  | {
      readonly kind: 'skip';
      readonly reason: 'no_repository' | 'validation_failed';
      readonly validationIssues?: ReadonlyArray<SheetValidationIssue>;
    }
  | {
      readonly kind: 'proceed';
      readonly repoRef: RepoRef;
      readonly markdown: string;
      readonly commitMessage: string;
    };

export function prepareAutoSyncCommit(input: AutoSyncPrepareInput): AutoSyncPrepareResult {
  const repoRef = extractRepoRefFromSpec(input.spec);
  if (repoRef === null) {
    return { kind: 'skip', reason: 'no_repository' };
  }

  // Sheets デフォルトの末尾空行 (約 1000 行) を trim してから validate / export する。
  // checkbox 列の false がデータあり判定されると md table に空 row が大量に出力される
  // ため、validation 前に削る (Issue #44)。
  const trimmedValues = trimTrailingEmptyRows(input.spec, input.sheetValues);
  const issues = validateSheetValues(input.spec, trimmedValues);
  if (issues.length > 0) {
    return { kind: 'skip', reason: 'validation_failed', validationIssues: issues };
  }

  const { body } = applySheetValuesToSpec(input.spec, trimmedValues);
  const markdown = `${input.frontmatterBlock}\n\n${body}\n`;
  const commitMessage = buildAutoCommitMessage(
    input.customMessage === undefined
      ? { spec: input.spec, sheetName: input.sheetName, isoTimestamp: input.isoTimestamp }
      : {
          spec: input.spec,
          sheetName: input.sheetName,
          isoTimestamp: input.isoTimestamp,
          customMessage: input.customMessage,
        },
  );
  return { kind: 'proceed', repoRef, markdown, commitMessage };
}

