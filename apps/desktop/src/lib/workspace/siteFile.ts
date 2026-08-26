/**
 * 一覧に並んだファイルのうち、画面が中身を組み立てないものを見分ける。
 *
 * web を名乗るフォルダでは、`.html` や `.css` も一覧に出る。これらは画面の中で
 * 組み立て直す相手ではなく、ブラウザで確かめる相手なので、開いたときの見せ方が
 * 業務文書とは別になる。
 *
 * 拡張子の並びをここに持たないのが要点。何を一覧へ出すかは読み取り側が決めており、
 * 同じ並びを画面側にも置くと、片方だけが増えたときに「一覧には出るのに開けない」
 * ファイルが生まれる。ここが持つのは、画面が組み立てられる種類の方だけ。
 */
import { isImagePath } from './imageFile';

/** 画面が中身を組み立てて見せる拡張子（本文・表・木）。 */
const VIEWABLE_EXTS = ['md', 'tsv', 'json', 'xml'] as const;

/** 相対パスの拡張子（小文字）。拡張子が無ければ null。 */
function extOf(relPath: string): string | null {
  const name = relPath.split(/[\/]/).at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  // 先頭のドットは拡張子ではなく名前の一部（`.gitignore`）。
  if (dot <= 0) return null;
  return name.slice(dot + 1).toLowerCase();
}

/** ブラウザで確かめる側のファイルか。 */
export function isSitePart(relPath: string): boolean {
  const ext = extOf(relPath);
  if (ext === null) return false;
  if ((VIEWABLE_EXTS as readonly string[]).includes(ext)) return false;
  return !isImagePath(relPath);
}
