// frontmatter の読み取り失敗を、読み手の言語の 1 文にする。
//
// パーサが返すのは英語の技術用語（`bad indentation of a mapping entry`）と、
// パーサ自身のブロック先頭から数えた行番号で、どちらも文書を書いた人には使えない。
// core は種類（kind）とファイル先頭からの行番号だけを返し、文言はアプリが持つ
// ——という分担なので、その文言側がここ。
import type { FrontmatterProblem, FrontmatterProblemKind } from '@md-business/core';
import type { MessageKey } from '../i18n/messages';
import type { TranslateParams } from '../i18n/translate';

/** t() と同じ形。i18n.svelte.ts に依存せず単体テストできるよう引数で受け取る。 */
export type Translate = (key: MessageKey, params?: TranslateParams) => string;

/** 失敗の種類 → 説明文のキー。core が種類を増やしたら型検査でここが赤くなる。 */
export const FRONTMATTER_MESSAGE_KEYS: Record<FrontmatterProblemKind, MessageKey> = {
  indentation: 'frontmatter.indentation',
  tab: 'frontmatter.tab',
  'duplicate-key': 'frontmatter.duplicateKey',
  unterminated: 'frontmatter.unterminated',
  'block-mapping': 'frontmatter.blockMapping',
  'too-large': 'frontmatter.tooLarge',
  'too-many-anchors': 'frontmatter.tooManyAnchors',
  'too-many-aliases': 'frontmatter.tooManyAliases',
  unknown: 'frontmatter.unknown',
};

/**
 * 「読み取れませんでした」＋（あれば）行番号＋種類ごとの説明、を 1 文にまとめる。
 * 桁は添えない。パーサが止まった位置であって、直す位置とは限らないため。
 */
export function frontmatterMessage(problem: FrontmatterProblem, t: Translate): string {
  const detail = t(FRONTMATTER_MESSAGE_KEYS[problem.kind], { raw: problem.raw });
  const located =
    problem.line === null ? detail : t('frontmatter.atLine', { line: problem.line, detail });
  return t('frontmatter.failed', { detail: located });
}
