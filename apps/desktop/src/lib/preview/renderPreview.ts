/**
 * デスクトップ・プレビューのオーケストレーター。
 *
 * source（生 .md）を 1 回だけ parse → frontmatter を registry で振り分け →
 * 該当 provider の permissive パイプラインで iframe srcdoc を生成する。対応
 * スキーマが無い / 解析不能なら not-applicable を返す（呼び出し側が理由表示）。
 */
import { parseMarkdown } from '@md-business/core';
import { resolveProvider } from './registry';
import { PROVIDERS } from './providers';
import type { PreviewResult, RenderPreviewOptions } from './previewFactory';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function renderPreview(
  source: string,
  options: RenderPreviewOptions = {},
): PreviewResult {
  let frontmatter: Record<string, unknown>;
  let body: string;
  try {
    const parsed = parseMarkdown(source);
    frontmatter = parsed.data;
    // prose スキーマ（spec / test-spec）は本文を HTML 化して描くため body も渡す。
    // データ駆動 4 スキーマは body を無視する。
    body = parsed.body;
  } catch (error: unknown) {
    return { ok: false, reason: `frontmatter を解析できませんでした: ${messageOf(error)}` };
  }

  const provider = resolveProvider(frontmatter, PROVIDERS);
  if (!provider) {
    return {
      ok: false,
      reason:
        '対応するスキーマが見つかりません（請求書 / 検証シート / 基本設計書 / DB 設計書 / NoSQL 設計書 / API 設計書）。',
    };
  }

  return provider.render(frontmatter, body, options);
}

export type { PreviewResult, RenderPreviewOptions } from './previewFactory';
