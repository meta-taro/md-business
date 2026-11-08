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
import { describeFrontmatterError, emphasisWarnings, parseMarkdown } from '@md-business/core';
import { isTsvSource } from '../tsv/detect';
import { isTsvFileName } from './providers/plainTsv';
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
  // 宣言の無い .tsv は、Markdown として読ませると列がつぶれる。素の表で描く。
  if (isTsvFileName(options.fileName)) {
    const { renderPlainTsvPreview } = await import('./providers/plainTsv');
    return renderPlainTsvPreview(source, options);
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
    return withEmphasisWarnings(renderMarkdownFallback(body, options, frontmatter), source);
  }

  const provider = await lazy.load();
  return withEmphasisWarnings(provider.render(frontmatter, body, options), source);
}

/**
 * 本文を地の文で描く文書だけ、記号のまま刷られる強調を知らせる（表や帳票の書式は本文を描かない）。
 * 行番号はファイルの行で数えるので、前の版と比べている間は比べた本文の行になり、少しずれることがある。
 */
function withEmphasisWarnings(result: PreviewResult, source: string): PreviewResult {
  if (!result.ok || result.comparable !== true) return result;
  const found = emphasisWarnings(source);
  return found.length === 0 ? result : { ...result, warnings: [...result.warnings, ...found] };
}

export type { PreviewResult, RenderPreviewOptions } from './previewFactory';
