/**
 * 静的サイト書き出しの下ごしらえ（純ロジック・IPC なし）。
 *
 * 組み立て本体は staticSite.ts、書き込みは Rust の `export_site`。ここにあるのは
 * その手前で要る「どのファイルを載せるか」「一覧の見出しを何にするか」だけ。
 * コントローラ（siteExportController）から切り離してあるのは、この判断を
 * Tauri を起動せずに確かめられるようにするため。
 */

/** 走査結果のうち、ここで見るぶんだけ。 */
export interface SiteEntry {
  relPath: string;
  ext: string;
}

/**
 * 一覧ページの見出しに使う、開いているフォルダの名前。
 * 区切りしか無い（`/`・空文字）ときは渡された文字列をそのまま使う。
 * 見出しが空のページを出すより、そのままの方が何のサイトか分かる。
 */
export function folderTitle(root: string): string {
  const parts = root.split(/[\\/]/).filter((part) => part !== '');
  return parts.length === 0 ? root : parts[parts.length - 1];
}

/**
 * サイトに載せる文書（`.md`）の相対パス。
 *
 * 検証シート（`.tsv`）は表として編集・実施するもので、プレビューを持たない。
 * 参考データ（`.json` / `.xml`）は正本ではない。どちらもページにしない。
 */
export function siteDocumentPaths(entries: readonly SiteEntry[]): string[] {
  return entries
    .filter((entry) => entry.ext.toLowerCase() === 'md')
    .map((entry) => entry.relPath);
}
