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
  try {
    frontmatter = parseMarkdown(source).data;
  } catch (error: unknown) {
    return { ok: false, reason: `frontmatter を解析できませんでした: ${messageOf(error)}` };
  }

  const provider = resolveProvider(frontmatter, PROVIDERS);
  if (!provider) {
    return {
      ok: false,
      reason:
        '対応するスキーマが見つかりません（invoice / db-spec / nosql-db-spec / api-spec）。',
    };
  }

  return provider.render(frontmatter, options);
}

export type { PreviewResult, RenderPreviewOptions } from './previewFactory';
