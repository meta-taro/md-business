/**
 * OS が出す窓の題名（タスクバー・Alt+Tab・ウィンドウ一覧）を組む純ロジック。
 * ------------------------------------------------------------------
 * 画面の中の題名は TopBar が出しているので、こちらは**窓の外**から見たときの話。
 * 窓を 2 つ以上並べられるようにした以上、外から見て同じ名前が 2 つ並ぶと、
 * どちらがどのフォルダなのかタスクバーからは選べない。
 *
 * 出すのは**フォルダ名**であって開いている文書名ではない。文書は切り替えるたびに
 * 変わるので、タスクバーの項目名がその都度書き換わって、目で追えなくなる。
 * 窓とフォルダは 1 対 1 で対応しているから、フォルダ名なら窓が閉じるまで動かない。
 */

/** アプリ名。フォルダを開いていないときはこれだけを出す。 */
const APP_NAME = 'md-business';

/** 窓の題名。フォルダを開いていれば「フォルダ名 — アプリ名」。 */
export function osWindowTitle(root: string | null): string {
  const name = folderName(root);
  return name === null ? APP_NAME : `${name} — ${APP_NAME}`;
}

/**
 * パスの末尾のフォルダ名。取れなければ `null`。
 *
 * 区切りは `/` と `\\` の両方を見る（Windows のパスがそのまま渡ってくる）。
 * ドライブ直下（`C:\\`）のように名前の無い場所は、記号だけの題名になるので出さない。
 */
function folderName(root: string | null): string | null {
  if (root === null) return null;
  const segments = root.split(/[/\\]/).filter((segment) => segment.trim().length > 0);
  const last = segments.at(-1);
  if (last === undefined) return null;
  // `C:` のようなドライブ指定だけの断片は、フォルダ名として意味を成さない。
  return /^[A-Za-z]:$/.test(last) ? null : last;
}
