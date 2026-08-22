/**
 * デスクトップ・プレビューのオーケストレーター。
 *
 * source（生 .md）を 1 回だけ parse → frontmatter を registry で振り分け →
 * 該当 provider の permissive パイプラインで iframe srcdoc を生成する。対応
 * スキーマが無い / 解析不能なら not-applicable を返す（呼び出し側が理由表示）。
 *
 * 非同期なのは、振り分けた後にそのスキーマの描画一式を読み込むため（providers/lazy）。
 * 「どのスキーマか」が決まるまで、どのスキーマの中身も読まない。
 */
import { describeFrontmatterError, parseMarkdown } from '@md-business/core';
import { isTsvSource } from '../tsv/detect';
import { resolveProvider } from './registry';
import { LAZY_PROVIDERS } from './providers/lazy';
import { renderMarkdownFallback } from './providers/markdownFallback';
import type { PreviewResult, RenderPreviewOptions } from './previewFactory';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function renderPreview(
  source: string,
  options: RenderPreviewOptions = {},
): Promise<PreviewResult> {
  // 検証シート（カスタム TSV）は frontmatter を持たない。先頭のマジック行で分かるので、
  // Markdown として読む前にここで振り分ける（読ませると本文まるごとの素の Markdown になる）。
  if (isTsvSource(source)) {
    const { renderSheetPreview } = await import('./providers/testSpecTsv');
    return renderSheetPreview(source, options);
  }

  let frontmatter: Record<string, unknown>;
  let body: string;
  try {
    const parsed = parseMarkdown(source);
    frontmatter = parsed.data;
    // prose スキーマ（spec / test-spec）は本文を HTML 化して描くため body も渡す。
    // データ駆動 4 スキーマは body を無視する。
    body = parsed.body;
  } catch (error: unknown) {
    // reason は診断用（パーサ原文）。画面に出すのは problem を訳した 1 文。
    return {
      ok: false,
      reason: `frontmatter を解析できませんでした: ${messageOf(error)}`,
      problem: describeFrontmatterError(error),
    };
  }

  const lazy = resolveProvider(frontmatter, LAZY_PROVIDERS);
  if (!lazy) {
    // 業務スキーマ非該当は空表示にせず、GitHub のように素の Markdown を描く。
    // frontmatter が解析できた（＝描画対象になる）ケースのみここへ来る。
    return renderMarkdownFallback(body, options);
  }

  const provider = await lazy.load();
  return provider.render(frontmatter, body, options);
}

export type { PreviewResult, RenderPreviewOptions } from './previewFactory';
