// 一括で書き出せなかった理由を、読み手の言語の 1 文にする。
//
// 組み立て側（`batchPlan`）は種類（kind）と、もとになった文字列だけを返す。文言はアプリが
// 持つ——という分担なので、その文言側がここ（`chartMessage` と同じ置き方）。
import type { BatchProblemKind } from './batchPlan';
import type { MessageKey } from '../i18n/messages';
import type { Translate } from './frontmatterMessage';

/**
 * 書き出せない理由。組み立ての段階で分かるもの（`BatchProblemKind`）に、
 * 読み書きの段階で初めて分かるものを足す。
 */
export type BatchFailureKind =
  | BatchProblemKind
  /** 指した表が開いているフォルダの外にある。 */
  | 'bad-path'
  /** 指した表を読めなかった。 */
  | 'read-failed'
  /** 指定された字が手元に無い。 */
  | 'missing-font';

export interface BatchFailure {
  kind: BatchFailureKind;
  /** 問題のもとになった文字列（列の名前・行の位置・足りない字など）。 */
  raw: string;
}

/** 書き出せない理由 → 説明文のキー。種類が増えたら型検査でここが赤くなる。 */
export const BATCH_MESSAGE_KEYS: Record<BatchFailureKind, MessageKey> = {
  'not-declared': 'batch.notDeclared',
  'bad-declaration': 'batch.badDeclaration',
  'no-rows': 'batch.noRows',
  'no-column': 'batch.noColumn',
  'empty-name': 'batch.emptyName',
  'duplicate-name': 'batch.duplicateName',
  'too-many': 'batch.tooMany',
  'bad-path': 'batch.badPath',
  'read-failed': 'batch.readFailed',
  'missing-font': 'batch.missingFont',
};

/** 理由の部分だけ。1 枚を撮るときは「一括で」で始めない（事実が違う）。 */
export function batchDetail(failure: BatchFailure, t: Translate): string {
  return t(BATCH_MESSAGE_KEYS[failure.kind], { raw: failure.raw });
}

export function batchMessage(failure: BatchFailure, t: Translate): string {
  return t('batch.failed', { detail: batchDetail(failure, t) });
}
