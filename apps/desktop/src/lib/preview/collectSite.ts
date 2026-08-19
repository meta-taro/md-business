/**
 * 開いているフォルダからサイト一式を組み立てる（IPC あり）。
 *
 * 書き出し（siteExportController）とブラウザ表示（browserPreviewController）で
 * 共有する。同じ手順を 2 か所に写すと、片方だけ直したときに「書き出した中身と
 * ブラウザで見た中身が違う」という、いちばん気づきにくいずれ方をする。
 *
 * 判断そのもの（どれを載せるか・見出しを何にするか）は siteExport.ts、
 * ページの描画は staticSite.ts。ここはその 2 つを繋ぐ手順だけを持つ。
 */
import { invoke } from '@tauri-apps/api/core';
import type { DocEntry } from '$lib/workspace/fileTree';
import type { SitePlan, SiteSource } from './staticSite';
import { folderTitle, siteDocumentPaths } from './siteExport';

/** Rust `scan_documents` の戻り。 */
interface ScanResult {
  entries: DocEntry[];
}

/**
 * フォルダ内の `.md` を全部ページにして返す。
 *
 * 出せる文書が無いときは空の計画（`pages` が空）を返す。呼ぶ側は `pages.length` で
 * 「何も出せなかった」を判定する。`skipped` には、読めたがページに出来なかった文書が入る。
 */
export async function collectSitePlan(root: string): Promise<SitePlan> {
  // ワークスペースのツリーは表示用に組み替えてあるので、走査をやり直して平坦な
  // 一覧を取る。除外（.git / node_modules / dist）は Rust 側が済ませている。
  const scan = await invoke<ScanResult>('scan_documents', { root });
  const paths = siteDocumentPaths(scan.entries);
  if (paths.length === 0) return { files: [], pages: [], assets: [], skipped: [] };

  const docs: SiteSource[] = [];
  for (const path of paths) {
    docs.push({ path, source: await invoke<string>('read_document', { root, relPath: path }) });
  }

  // ページの組み立てはプレビューと同じ描画一式を使う。起動時に読ませないよう、
  // 実際に組むここで読み込む。
  const { buildStaticSite } = await import('./staticSite');
  return await buildStaticSite(docs, { title: folderTitle(root) });
}
