import type { FrontmatterProblem, FrontmatterProblemKind } from '@md-business/core';

/**
 * frontmatter の読み取り失敗を、書いた人に向けた 1 文にする。
 *
 * パーサが返すのは英語の技術用語（`bad indentation of a mapping entry`）と、
 * パーサ自身のブロック先頭から数えた行番号で、どちらもそのまま出しても直せない。
 * 桁は添えない。パーサが読み進めて止まった位置であって、直す位置とは限らない。
 */
const EXPLANATIONS: Record<FrontmatterProblemKind, string> = {
  indentation: '行頭の字下げが、上の行とそろっていません。',
  tab: '字下げにタブが使われています。空白に置き換えてください。',
  'duplicate-key': '同じ項目名が 2 回書かれています。',
  unterminated: '引用符またはかっこが閉じられていません。',
  'block-mapping': 'この行が「項目名: 値」の形になっていません。',
  'too-large': 'frontmatter が大きすぎて読み取れません。',
  'too-many-anchors': 'YAML のアンカー（&名前）が多すぎます。',
  'too-many-aliases': 'YAML の参照（*名前）が多すぎます。',
  unknown: '',
};

export function frontmatterHint(problem: FrontmatterProblem): string {
  const explanation =
    EXPLANATIONS[problem.kind] || `ここで読み取りが止まりました（${problem.raw}）。`;
  return problem.line === null ? explanation : `${problem.line} 行目: ${explanation}`;
}
