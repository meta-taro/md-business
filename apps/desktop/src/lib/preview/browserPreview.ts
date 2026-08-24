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
 * ページになる `.md` だけでなく、CSS・JS・データも同じフォルダから出しているので、
 * どれが変わっても読み直させる。**種類で絞らない**のは、絞った表がサーバー側の表と
 * 食い違うと、直したのに窓が古いまま——という、最も気づきにくい止まり方をするため。
 * 出してよいかを決めるのは常にサーバー側で、ここは「動きがあったか」しか見ない。
 */
export function affectsSite(relPath: string): boolean {
  return !relPath.startsWith(OUTPUT_DIR);
}

/**
 * 開いているフォルダが変わったとき、立っているサーバーを畳むか。
 *
 * 畳まないと、別のフォルダを開いた後も前のフォルダの中身が同じ URL で出続ける。
 */
export function shouldStop(servingRoot: string, currentRoot: string | null): boolean {
  return servingRoot !== currentRoot;
}
