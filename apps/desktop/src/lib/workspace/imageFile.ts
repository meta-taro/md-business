/**
 * 画像として開くファイルかどうかを、名前だけで決める。
 *
 * 中身を覗いて種類を当てにいかない。拡張子と中身が食い違うファイルを「正しい種類」として
 * 画面へ送り出すことになるため。ここで通した名前だけが読み取り側へ渡り、その先で
 * ルートの中に在るか・大きすぎないかが改めて確かめられる。
 */

/** 画像として開ける拡張子。読み取り側の一覧と同じ並びを保つ。 */
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] as const;

/** 画像として開ける拡張子。 */
export type ImageExt = (typeof IMAGE_EXTS)[number];

/** 相対パスの拡張子（小文字）。画像として扱わないものは null。 */
export function imageExtOf(relPath: string): ImageExt | null {
  const name = relPath.split(/[\\/]/).at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  // 先頭のドットは拡張子ではなく名前の一部（`.gitignore`）。
  if (dot <= 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return (IMAGE_EXTS as readonly string[]).includes(ext) ? (ext as ImageExt) : null;
}

/** 画像として開くファイルか。 */
export function isImagePath(relPath: string): boolean {
  return imageExtOf(relPath) !== null;
}
