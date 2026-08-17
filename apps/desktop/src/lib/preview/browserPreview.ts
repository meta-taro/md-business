/**
 * ブラウザ表示の判断（純ロジック・IPC なし）。
 *
 * サーバーの出し入れは browserPreviewController、待ち受けは Rust 側。ここにあるのは
 * 「変化を受けて組み直すか」「表示をやめるか」だけ。コントローラから切り離してあるのは、
 * この判断を Tauri を起動せずに確かめられるようにするため（siteExport.ts と同じ切り方）。
 */

/** 書き出し先。ここの変化は自分が書いた結果なので、受けて組み直すと堂々巡りになる。 */
const OUTPUT_DIR = 'dist/';

/**
 * その相対パスの変化でサイトを組み直すか。
 *
 * ページになるのは `.md` だけ（siteDocumentPaths と同じ線）。検証シートや参考データが
 * 変わるたびに組み直すと、表を 1 セット打っている間ずっと組み直しが走る。
 */
export function affectsSite(relPath: string): boolean {
  if (relPath.startsWith(OUTPUT_DIR)) return false;
  return /\.md$/i.test(relPath);
}

/**
 * 開いているフォルダが変わったとき、立っているサーバーを畳むか。
 *
 * 畳まないと、別のフォルダを開いた後も前のフォルダの中身が同じ URL で出続ける。
 */
export function shouldStop(servingRoot: string, currentRoot: string | null): boolean {
  return servingRoot !== currentRoot;
}
