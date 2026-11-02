/**
 * 左レールの表示の種類（ツリー / サムネイル格子）。起動時に読むので、ここには保存値の
 * 読み戻しだけを置く。格子の中身は格子を開いたときに読み込む（thumbnailGrid）。
 */
export type ExplorerView = "tree" | "grid";

export const EXPLORER_VIEW_KEY = "md-business.explorerView";

export function parseExplorerView(raw: string | null): ExplorerView {
  return raw === "grid" ? "grid" : "tree";
}
