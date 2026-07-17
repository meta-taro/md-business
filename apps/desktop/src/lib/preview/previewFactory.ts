/**
 * スキーマ横断のプレビュー・パイプライン工場。
 *
 * apiSpecPreview.ts（Phase 1c）の permissive パイプラインを一般化したもの:
 *   normalize → autofill → warnings 集約 → validate → errors 翻訳 →
 *   withPreviewDefaults → documentTitle → renderBody（try/catch）→
 *   buildPreviewDocument（iframe srcdoc）
 *
 * 「編集途中でも半分空で描画する」方針は Phase 1c と同じ。検証エラーは描画を
 * 止めず側チャネル（errors）で返す。renderBody が throw した場合のみ本文空 +
 * fatal メッセージにフォールバックする。
 *
 * 各スキーマは本工場に「薄い config 1 個」を渡すだけ（providers/ 配下）。データ駆動
 * 4 スキーマ（invoice / db-spec / nosql-db-spec / api-spec）は DOM 非依存のため
 * ここまで Node で単体テストできる。prose 2 スキーマ（spec / test-spec）は
 * sanitizer 移植を伴うため Phase 2c で追加する。
 */
import {
  validateWithCompiled,
  type CompiledValidator,
  type ValidationError,
} from '@md-business/core';
import { buildPreviewDocument, type PreviewTheme } from './previewDocument';
import type { PreviewProviderMeta } from './registry';

/** normalize / autofill が返す非致命 warning の共通シェイプ。 */
export interface PreviewWarning {
  path: string;
  message: string;
}

/** normalize / autofill の戻り値シェイプ（各スキーマ共通）。 */
export interface NormalizeLike {
  data: Record<string, unknown>;
  warnings: PreviewWarning[];
}

export interface SchemaPreviewConfig<T> {
  /** スキーマ ID / 表示名 / 検出マーカー（registry と共有）。 */
  meta: PreviewProviderMeta;
  normalize: (frontmatter: Record<string, unknown>) => NormalizeLike;
  autofill: (data: Record<string, unknown>) => NormalizeLike;
  validate: CompiledValidator;
  translateErrors: (errors: ValidationError[]) => string[];
  translateWarnings: (warnings: PreviewWarning[]) => string[];
  /** autofill が保証しない identity / 配列シェルを空で補い、renderBody 可能にする。 */
  withPreviewDefaults: (data: Record<string, unknown>) => T;
  documentTitle: (data: T) => string;
  renderBody: (data: T) => string;
  /** renderer-pdf の文書別 CSS（?raw インポート）。 */
  css: string;
}

export interface PreviewOk {
  ok: true;
  /** `<iframe srcdoc>` に渡す完全な HTML 文書。 */
  srcdoc: string;
  /** <title> / タブ名に使う文書タイトル。 */
  documentTitle: string;
  /** 解決したスキーマの表示名（ペイン見出し用）。 */
  label: string;
  /** 日本語化済みの非致命 warning。 */
  warnings: string[];
  /** 日本語化済みの検証エラー（描画は止めない側チャネル）。 */
  errors: string[];
  /** renderer 自体が throw した場合の最終手段メッセージ。 */
  fatal?: string;
}

export interface PreviewNotApplicable {
  ok: false;
  /** 対応スキーマ無し / 解析不能などの理由（日本語）。 */
  reason: string;
}

export type PreviewResult = PreviewOk | PreviewNotApplicable;

export interface RenderPreviewOptions {
  /** iframe 内のテーマ。アプリのライト/ダークと一致させる。 */
  theme?: PreviewTheme;
}

export interface PreviewProvider extends PreviewProviderMeta {
  render(frontmatter: Record<string, unknown>, options?: RenderPreviewOptions): PreviewResult;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createSchemaPreview<T>(config: SchemaPreviewConfig<T>): PreviewProvider {
  const { meta } = config;

  return {
    id: meta.id,
    label: meta.label,
    markers: meta.markers,
    render(frontmatter: Record<string, unknown>, options: RenderPreviewOptions = {}): PreviewResult {
      const { theme } = options;

      const normalized = config.normalize(frontmatter);
      const autofilled = config.autofill(normalized.data);
      const warnings = config.translateWarnings([...normalized.warnings, ...autofilled.warnings]);
      const validation = validateWithCompiled<T>(autofilled.data, config.validate);
      const errors = validation.ok ? [] : config.translateErrors(validation.errors);

      const safe = config.withPreviewDefaults(autofilled.data);
      const documentTitle = config.documentTitle(safe);

      let bodyHtml: string;
      try {
        bodyHtml = config.renderBody(safe);
      } catch (error: unknown) {
        return {
          ok: true,
          srcdoc: buildPreviewDocument({ bodyHtml: '', css: config.css, title: documentTitle, theme }),
          documentTitle,
          label: meta.label,
          warnings,
          errors,
          fatal: `プレビューを描画できませんでした: ${messageOf(error)}`,
        };
      }

      return {
        ok: true,
        srcdoc: buildPreviewDocument({ bodyHtml, css: config.css, title: documentTitle, theme }),
        documentTitle,
        label: meta.label,
        warnings,
        errors,
      };
    },
  };
}
