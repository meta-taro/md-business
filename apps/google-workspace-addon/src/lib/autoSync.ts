import type { TestSpec } from '@md-business/schema-test-spec';

import {
  extractRepoRefFromSpec,
  buildAutoCommitMessage,
  type RepoRef,
} from './githubApi.js';
import {
  applySheetValuesToSpec,
  validateSheetValues,
  type SheetValidationIssue,
} from './testSpecSheetOps.js';

/**
 * Phase 3C 自動同期フローの「副作用ゼロ層」。
 *
 * Why: onEdit / time-based trigger 経由の auto-commit は SpreadsheetApp /
 *      ScriptApp / UrlFetchApp / PropertiesService / Utilities に深く依存する
 *      ため Vitest で直接テストできない。バリデーション・markdown 構築・状態
 *      の (de)serialize を純粋関数として切り出し、trigger 層 (main.ts) は
 *      これらの結果を渡し合うだけにする。
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

  const mutableValues = input.sheetValues.map((row) => row.slice());
  const issues = validateSheetValues(input.spec, mutableValues);
  if (issues.length > 0) {
    return { kind: 'skip', reason: 'validation_failed', validationIssues: issues };
  }

  const { body } = applySheetValuesToSpec(input.spec, mutableValues);
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

export type AutoSyncState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly lastEditAt: string }
  | {
      readonly kind: 'success';
      readonly syncedAt: string;
      readonly commitSha: string;
      readonly bytes: number;
    }
  | {
      readonly kind: 'error';
      readonly failedAt: string;
      readonly reason: string;
      readonly details?: string;
    };

const IDLE: AutoSyncState = { kind: 'idle' };

export function parseAutoSyncState(input: string | null): AutoSyncState {
  if (input === null || input.length === 0) return IDLE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return IDLE;
  }
  if (typeof parsed !== 'object' || parsed === null) return IDLE;
  const obj = parsed as Record<string, unknown>;
  const kind = obj.kind;
  if (kind === 'idle') return IDLE;
  if (kind === 'pending' && typeof obj.lastEditAt === 'string') {
    return { kind: 'pending', lastEditAt: obj.lastEditAt };
  }
  if (
    kind === 'success' &&
    typeof obj.syncedAt === 'string' &&
    typeof obj.commitSha === 'string' &&
    typeof obj.bytes === 'number'
  ) {
    return {
      kind: 'success',
      syncedAt: obj.syncedAt,
      commitSha: obj.commitSha,
      bytes: obj.bytes,
    };
  }
  if (kind === 'error' && typeof obj.failedAt === 'string' && typeof obj.reason === 'string') {
    const base = { kind: 'error' as const, failedAt: obj.failedAt, reason: obj.reason };
    if (typeof obj.details === 'string') {
      return { ...base, details: obj.details };
    }
    return base;
  }
  return IDLE;
}

export function serializeAutoSyncState(state: AutoSyncState): string {
  return JSON.stringify(state);
}
