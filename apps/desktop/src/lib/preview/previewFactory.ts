/**
 * スキーマ横断のプレビュー・パイプライン工場。
 *
 * スキーマ 1 種ぶんの permissive パイプラインを一般化したもの:
 *   normalize → autofill → warnings 集約 → validate → errors 翻訳 →
 *   withPreviewDefaults → documentTitle → renderBody（try/catch）→
 *   buildPreviewDocument（iframe srcdoc）
 *
 * 「編集途中でも半分空で描画する」方針を採る。検証エラーは描画を
 * 止めず側チャネル（errors）で返す。renderBody が throw した場合のみ本文空 +
 * fatal メッセージにフォールバックする。
 *
 * 各スキーマは本工場に「薄い config 1 個」を渡すだけ（providers/ 配下）。データ駆動
 * 4 スキーマ（invoice / db-spec / nosql-db-spec / api-spec）は DOM 非依存のため
 * ここまで Node で単体テストできる。prose 2 スキーマ（spec / test-spec）は
 * sanitizer の移植を伴うため別扱いとする。
 */
import {
  validateWithCompiled,
  type CompiledValidator,
  type FrontmatterProblem,
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
  /**
   * ペイン見出しに出す表示名を文書ごとに上書きする（省略時は `meta.label`）。
   * invoice のように 1 スキーマで複数の文書種別（請求書 / 見積書 / 領収書）を
   * 扱う場合、見出しがスキーマ名のままだと開いている文書と食い違うため。
   * registry 側の静的な `meta.label` は検出・一覧用なのでそのまま残す。
   */
  documentLabel?: (data: T) => string;
  /**
   * body 断片を生成する。第 2 引数 `body` は Markdown 本文（frontmatter 除去済み）。
   * prose スキーマ（spec / test-spec）はこれを HTML 化・sanitize して本文に描く。
   * データ駆動スキーマは frontmatter のみで描くため body を無視する（`(data) => …`
   * のままでも代入可能）。
   */
  renderBody: (data: T, body: string) => string;
  /** renderer-pdf の文書別 CSS（?raw インポート）。 */
  css: string;
}

/**
 * 描画に使った文書 CSS。静的サイト出力が「同じ書式のページで CSS を 1 本に
 * まとめる」ために要る。どのスキーマになるかは描いてみるまで決まらないので、
 * 呼ぶ側が事前に知る手立ては無く、結果に添えて返すしかない。
 */
export interface PreviewStyle {
  /** スキーマ ID（= CSS ファイル名のもと）。 */
  id: string;
  /** CSS のテキスト。 */
  css: string;
}

export interface PreviewOk {
  ok: true;
  /** `<iframe srcdoc>` に渡す完全な HTML 文書。 */
  srcdoc: string;
  /** 描画に使った文書 CSS（外部ファイルへ出すとき用）。 */
  style: PreviewStyle;
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
  /**
   * frontmatter が読めなかった場合の分類と位置。表示側がこれを読み手の言語の
   * 1 文にする（reason はログ・診断用に原文を残す）。
   */
  problem?: FrontmatterProblem;
}

export type PreviewResult = PreviewOk | PreviewNotApplicable;

export interface RenderPreviewOptions {
  /** iframe 内のテーマ。アプリのライト/ダークと一致させる。 */
  theme?: PreviewTheme;
  /**
   * iframe 内ショートカット横取りスクリプトを入れるか。既定 true（画面プレビュー）。
   * アプリの外へ出す HTML（書き出し）だけが false を渡す。
   */
  shortcuts?: boolean;
  /**
   * 文書 CSS を外部ファイルにして `<link>` で読ませる。スキーマ ID を受け取り、
   * そのページから見た CSS の URL を返す（ページの深さで `../` の数が変わるため、
   * 固定文字列ではなく関数で受け取る）。渡すのは静的サイト出力だけ。
   */
  cssHref?: (styleId: string) => string;
}

export interface PreviewProvider extends PreviewProviderMeta {
  render(
    frontmatter: Record<string, unknown>,
    body?: string,
    options?: RenderPreviewOptions,
  ): PreviewResult;
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
    render(
      frontmatter: Record<string, unknown>,
      body = '',
      options: RenderPreviewOptions = {},
    ): PreviewResult {
      const { theme, shortcuts } = options;
      const cssHref = options.cssHref?.(meta.id);
      const style = { id: meta.id, css: config.css };

      const normalized = config.normalize(frontmatter);
      const autofilled = config.autofill(normalized.data);
      const warnings = config.translateWarnings([...normalized.warnings, ...autofilled.warnings]);
      const validation = validateWithCompiled<T>(autofilled.data, config.validate);
      const errors = validation.ok ? [] : config.translateErrors(validation.errors);

      const safe = config.withPreviewDefaults(autofilled.data);
      const documentTitle = config.documentTitle(safe);
      const label = config.documentLabel?.(safe) ?? meta.label;

      let bodyHtml: string;
      try {
        bodyHtml = config.renderBody(safe, body);
      } catch (error: unknown) {
        return {
          ok: true,
          srcdoc: buildPreviewDocument({
            bodyHtml: '',
            css: config.css,
            cssHref,
            title: documentTitle,
            theme,
            shortcuts,
          }),
          style,
          documentTitle,
          label,
          warnings,
          errors,
          fatal: `プレビューを描画できませんでした: ${messageOf(error)}`,
        };
      }

      return {
        ok: true,
        srcdoc: buildPreviewDocument({
          bodyHtml,
          css: config.css,
          cssHref,
          title: documentTitle,
          theme,
          shortcuts,
        }),
        style,
        documentTitle,
        label,
        warnings,
        errors,
      };
    },
  };
}
