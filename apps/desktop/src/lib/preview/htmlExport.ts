/**
 * 単一 HTML 書き出し（Issue 023 ブロック 1）。
 *
 * 画面プレビューと**同じ経路**で組む。プレビューは既に「文書 CSS を埋め込んだ完全な
 * HTML 文書」を作って iframe へ渡しているので、書き出しはそこから 2 点だけ変えたもの:
 *
 *   - ショートカット横取りスクリプトを外す（アプリの外では相手の操作を奪うだけ）
 *   - 配色を明るい側に固定する（受け取る側の環境は分からない。印刷すれば地は白）
 *
 * 別系統で組み直さないのは、画面で確かめたものと人に送るものが食い違うと、
 * 確かめた意味が無くなるため。
 *
 * 出力先は決めない。ここが返すのは中身だけで、どこへ書くかは Rust 側が
 * 元の文書の場所から決める（フロントに出力先を持たせない）。
 */
import { renderPreview } from './renderPreview';

/**
 * 書き出す HTML を組む。frontmatter が壊れていて描画対象にならないときは null
 * （＝押せるボタンにしない）。
 *
 * 非同期なのはプレビューと同じ理由で、そのスキーマの描画一式を読んでから組むため。
 */
export async function buildExportHtml(source: string): Promise<string | null> {
  const result = await renderPreview(source, { theme: 'light', shortcuts: false });
  return result.ok ? result.srcdoc : null;
}
