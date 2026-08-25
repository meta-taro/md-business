// 表にできなかった理由を、読み手の言語の 1 文にする。
//
// 読み取り側（`loadData`）は種類（kind）と、もとになった文字列・行番号だけを返す。
// 文言はアプリが持つ——という分担なので、その文言側がここ（`chartMessage` と同じ置き方）。
import type { DataLoadKind, DataLoadProblem } from './loadData';
import type { MessageKey } from '../i18n/messages';
import type { Translate } from '../preview/frontmatterMessage';

/** 表にできない理由 → 説明文のキー。種類が増えたら型検査でここが赤くなる。 */
export const DATA_MESSAGE_KEYS: Record<DataLoadKind, MessageKey> = {
  empty: 'dataBlock.empty',
  syntax: 'dataBlock.syntax',
  'unknown-key': 'dataBlock.unknownKey',
  'duplicate-key': 'dataBlock.duplicateKey',
  missing: 'dataBlock.missing',
  'bad-path': 'dataBlock.badPath',
  'read-failed': 'dataBlock.readFailed',
  'no-rows': 'dataBlock.noRows',
};

export function dataMessage(problem: DataLoadProblem, t: Translate): string {
  const detail = t(DATA_MESSAGE_KEYS[problem.kind], { raw: problem.raw });
  const located =
    problem.line === null ? detail : t('dataBlock.atLine', { line: problem.line, detail });
  return t('dataBlock.failed', { detail: located });
}
