/**
 * Markdown（API 設計書）→ iframe プレビュー用 srcdoc への変換アダプター。
 *
 * chrome-extension の api-spec プラグイン `previewRender` と同じ permissive
 * パイプライン（normalize → autofill → validate → renderApiSpecBody）を
 * デスクトップへ最小移植したもの。編集途中でも「半分空でも描画する」方針で、
 * 検証エラーは描画を止めず側チャネル（errors）で返す。
 *
 * Phase 1c は api-spec 先行。全 6 スキーマ対応時に registry へ一般化する。
 */
import { parseMarkdown, validateWithCompiled } from '@md-business/core';
import {
  normalizeApiSpecFrontmatter,
  autofillApiSpec,
  translateApiSpecErrors,
  translateApiSpecWarnings,
  type ApiSpec,
} from '@md-business/schema-api-spec';
import validateApiSpec from '@md-business/schema-api-spec/validate';
import { renderApiSpecBody } from '@md-business/renderer-pdf';
import apiSpecCss from '@md-business/renderer-pdf/styles/api-spec.css?raw';
import { buildPreviewDocument, type PreviewTheme } from './previewDocument';

export interface ApiSpecPreviewOk {
  ok: true;
  /** `<iframe srcdoc>` に渡す完全な HTML 文書。 */
  srcdoc: string;
  /** <title> / タブ名に使う文書タイトル。 */
  documentTitle: string;
  /** 日本語化済みの非致命 warning。 */
  warnings: string[];
  /** 日本語化済みの検証エラー（描画は止めない側チャネル）。 */
  errors: string[];
  /** renderer 自体が throw した場合の最終手段メッセージ。 */
  fatal?: string;
}

export interface ApiSpecPreviewNotApplicable {
  ok: false;
  /** api-spec でない / 解析不能などの理由（日本語）。 */
  reason: string;
}

export type ApiSpecPreviewResult = ApiSpecPreviewOk | ApiSpecPreviewNotApplicable;

export interface RenderApiSpecPreviewOptions {
  /** iframe 内のテーマ。アプリのライト/ダークと一致させる。 */
  theme?: PreviewTheme;
}

// `endpoints` / `エンドポイント` は api-spec 固有マーカー（db-spec の tables /
// nosql の collections と衝突しない）。schema / schemaVersion が無い純日本語
// frontmatter でも api-spec と判定できる。
const API_SPEC_MARKERS = ['endpoints', 'エンドポイント'] as const;

function isApiSpec(frontmatter: Record<string, unknown>): boolean {
  const schema = frontmatter['schema'];
  if (typeof schema === 'string' && schema.split('/')[0] === 'api-spec') return true;
  const schemaVersion = frontmatter['schemaVersion'];
  if (typeof schemaVersion === 'string' && schemaVersion.split('/')[0] === 'api-spec') return true;
  return API_SPEC_MARKERS.some((key) => key in frontmatter);
}

/**
 * renderApiSpecBody が編集途中でも描画できるよう、autofill が保証しない
 * 必須の identity フィールドと配列シェルだけ空で補う。chrome-extension の
 * api-spec プラグイン withPreviewDefaults と同じ意図。
 */
function withPreviewDefaults(data: Record<string, unknown>): ApiSpec {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['documentNumber']) safe['documentNumber'] = '';
  if (!safe['title']) safe['title'] = '';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (!Array.isArray(safe['authors']) || (safe['authors'] as unknown[]).length === 0) {
    safe['authors'] = [{ name: '' }];
  }
  if (!Array.isArray(safe['endpoints'])) {
    safe['endpoints'] = [];
  }
  return safe as unknown as ApiSpec;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function renderApiSpecPreview(
  source: string,
  options: RenderApiSpecPreviewOptions = {},
): ApiSpecPreviewResult {
  const { theme } = options;

  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = parseMarkdown(source).data;
  } catch (error: unknown) {
    return { ok: false, reason: `frontmatter を解析できませんでした: ${messageOf(error)}` };
  }

  if (!isApiSpec(frontmatter)) {
    return {
      ok: false,
      reason: 'API 設計書ではありません（endpoints / エンドポイント が見当たりません）。',
    };
  }

  const normalized = normalizeApiSpecFrontmatter(frontmatter);
  const autofilled = autofillApiSpec(normalized.data);
  const warnings = translateApiSpecWarnings([...normalized.warnings, ...autofilled.warnings]);
  const validation = validateWithCompiled<ApiSpec>(autofilled.data, validateApiSpec);
  const errors = validation.ok ? [] : translateApiSpecErrors(validation.errors);

  const safe = withPreviewDefaults(autofilled.data);
  const documentTitle = safe.title || `API 設計書 ${safe.documentNumber ?? ''}`.trim();

  let bodyHtml: string;
  try {
    bodyHtml = renderApiSpecBody(safe);
  } catch (error: unknown) {
    return {
      ok: true,
      srcdoc: buildPreviewDocument({ bodyHtml: '', css: apiSpecCss, title: documentTitle, theme }),
      documentTitle,
      warnings,
      errors,
      fatal: `プレビューを描画できませんでした: ${messageOf(error)}`,
    };
  }

  return {
    ok: true,
    srcdoc: buildPreviewDocument({ bodyHtml, css: apiSpecCss, title: documentTitle, theme }),
    documentTitle,
    warnings,
    errors,
  };
}
