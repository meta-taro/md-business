/**
 * 2 つの文字列の「変わったところ」を 1 区間として求める純ロジック。
 *
 * グリッドで 1 セル確定するたびに本文全体を組み直しているため、エディター側へは
 * 毎回まったく新しい文字列が渡る。それをそのまま丸ごと差し替えると、実際には
 * 数文字しか変わっていなくても文書全体を読み直すことになる。変わった範囲だけを
 * 渡せば、その負担は変更の大きさに見合ったものになる。
 */

/** 差し替える範囲と、そこへ入れる文字列。位置は UTF-16 単位。 */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/**
 * 位置 `index` がサロゲートペアの途中かどうか。
 * 絵文字などは 2 単位で 1 文字なので、その間で切ると壊れた文字ができる。
 */
function splitsSurrogatePair(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false;
  const high = text.charCodeAt(index - 1);
  const low = text.charCodeAt(index);
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff;
}

/**
 * `before` を `after` にするための最小の 1 区間を返す。同じなら null。
 *
 * 前と後ろから一致するぶんを詰めるだけの単純な方法で、途中に離れた変更が
 * 複数あればその全体を 1 区間にまとめる。行の入れ替えのような場合は範囲が
 * 広くなるが、正しさは保たれる（当てれば必ず `after` になる）。
 */
export function diffEdit(before: string, after: string): TextEdit | null {
  if (before === after) return null;

  const max = Math.min(before.length, after.length);

  let prefix = 0;
  while (prefix < max && before.charCodeAt(prefix) === after.charCodeAt(prefix)) {
    prefix += 1;
  }
  if (splitsSurrogatePair(before, prefix)) prefix -= 1;

  // 前から詰めたぶんを超えて詰めると範囲が重なる（to < from の壊れた区間になる）。
  let suffix = 0;
  while (
    suffix < max - prefix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix += 1;
  }
  if (splitsSurrogatePair(before, before.length - suffix)) suffix -= 1;

  return {
    from: prefix,
    to: before.length - suffix,
    insert: after.slice(prefix, after.length - suffix),
  };
}
