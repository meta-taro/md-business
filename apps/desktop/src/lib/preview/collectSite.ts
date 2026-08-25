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
import type { BuildStaticSiteOptions, SiteAsset, SitePlan, SiteSource } from './staticSite';
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
 *
 * @param rawHtml 本文に直接書かれた HTML をそのまま載せるか。既定は載せない。
 *   渡すのは、web モードを宣言していて、かつこの PC で人が 1 回許したと確かめた側だけ。
 */
export async function collectSitePlan(
  root: string,
  { rawHtml }: Pick<BuildStaticSiteOptions, 'rawHtml'> = {},
): Promise<SitePlan> {
  // ワークスペースのツリーは表示用に組み替えてあるので、走査をやり直して平坦な
  // 一覧を取る。除外（.git / node_modules / dist）は Rust 側が済ませている。
  const scan = await invoke<ScanResult>('scan_documents', { root });
  const paths = siteDocumentPaths(scan.entries);
  if (paths.length === 0) {
    // `.md` が 1 つも無くても、書いた HTML だけのサイトは成立する。
    return { files: [], pages: [], assets: await siteAssets(root, rawHtml), skipped: [] };
  }

  // 図は本文の段階で絵に替えてから渡す。囲みのまま渡すと、サイトだけ図が出ない。
  // 画像はページの組み立て側がファイルとして運ぶので、ここでは埋めない。
  const { composeExportSource } = await import('./composeSource');
  const { chartMessage } = await import('$lib/chart/chartMessage');
  const { CHART_INK } = await import('$lib/chart/chartInk');
  const { renderMermaidSvg } = await import('./renderMermaid');
  const { t } = await import('$lib/i18n/i18n.svelte');

  const docs: SiteSource[] = [];
  for (const path of paths) {
    const source = await invoke<string>('read_document', { root, relPath: path });
    docs.push({
      path,
      source: await composeExportSource(source, {
        docPath: path,
        io: { readText: (target) => invoke<string>('read_document', { root, relPath: target }) },
        describe: (problem) => chartMessage(problem, t),
        ink: CHART_INK.light,
        mermaid: { theme: 'light', render: renderMermaidSvg },
      }),
    });
  }

  // ページの組み立てはプレビューと同じ描画一式を使う。起動時に読ませないよう、
  // 実際に組むここで読み込む。
  const { buildStaticSite } = await import('./staticSite');
  const plan = await buildStaticSite(docs, { title: folderTitle(root), rawHtml });
  const extra = await siteAssets(root, rawHtml);
  if (extra.length === 0) return plan;
  // 組み立てが同じ置き場所を使っていたら、そちらを残す（本文から作ったページと
  // 手で書いたファイルが同じ名前なら、ページのほうが新しい）。
  const taken = new Set([...plan.files.map((f) => f.path), ...plan.assets.map((a) => a.dest)]);
  return { ...plan, assets: [...plan.assets, ...extra.filter((a) => !taken.has(a.dest))] };
}

/**
 * ページ以外でサイトに載せるもの（CSS・JS・書いた HTML・データ）を集める。
 *
 * **web モードのときだけ。**業務文書を見るだけの人のフォルダを丸ごと出すと、
 * 隣に置いてあるだけのファイルまで待ち受けから引けることになる。
 *
 * 置き場所は元のままにする。付け替えると、書いた側の `href` / `fetch` が届かない。
 */
async function siteAssets(root: string, rawHtml: boolean | undefined): Promise<SiteAsset[]> {
  if (rawHtml !== true) return [];
  const scan = await invoke<ScanResult>('scan_site_assets', { root });
  return scan.entries.map((entry) => ({ src: entry.relPath, dest: entry.relPath }));
}
