// 参考データを開けなかった理由を、読み手の言語の 1 文にする。
//
// 読み取り側（@md-business/data-tree）が返す文は英語で、AI クライアントが読む前提の
// 書き方をしている。画面に出すのは種類（kind）から組んだ文言のほうで、分担は
// frontmatter の失敗表示と同じ——読み取り側は種類と行番号だけを返し、文言はアプリが持つ。
import type { DataProblem, DataProblemKind } from '@md-business/data-tree';
import type { MessageKey } from '../i18n/messages';
import type { TranslateParams } from '../i18n/translate';

/** t() と同じ形。i18n.svelte.ts に依存せず単体テストできるよう引数で受け取る。 */
export type Translate = (key: MessageKey, params?: TranslateParams) => string;

/** 断る理由の種類 → 説明文のキー。読み取り側が種類を増やしたら型検査でここが赤くなる。 */
export const DATA_PROBLEM_MESSAGE_KEYS: Record<DataProblemKind, MessageKey> = {
  size: 'data.size',
  syntax: 'data.syntax',
  depth: 'data.depth',
  nodes: 'data.nodes',
  doctype: 'data.doctype',
  entity: 'data.entity',
  unsupported: 'data.unsupported',
};

/**
 * 「開けませんでした」＋（分かれば）行番号＋種類ごとの説明、を 1 文にまとめる。
 * 桁は添えない。読み取りが止まった位置であって、直す位置とは限らないため。
 */
export function dataProblemMessage(problem: DataProblem, t: Translate): string {
  const detail = t(DATA_PROBLEM_MESSAGE_KEYS[problem.kind]);
  const located =
    problem.line === undefined ? detail : t('data.atLine', { line: problem.line, detail });
  return t('data.refused', { detail: located });
}
