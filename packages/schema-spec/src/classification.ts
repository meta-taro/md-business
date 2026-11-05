import type { DocumentEdition } from '@md-business/core';
import type { Spec } from './types.js';

/** 提出版で区分を書いていないときに出す区分。 */
export const DEFAULT_SUBMISSION_CLASSIFICATION = '提出用';

/**
 * その版で表紙・ページ頭・保存名に出す区分。
 *
 * 提出版では社内の区分（社外秘など）を出さない。中身から社内の節を落としても、
 * 社内の区分が表紙に残れば、社内向けの文書だったことがそのまま伝わる。
 */
export function resolveClassification(spec: Spec, edition: DocumentEdition): string {
  if (edition === 'submission') {
    return spec.submissionClassification ?? DEFAULT_SUBMISSION_CLASSIFICATION;
  }
  return spec.classification ?? '';
}
