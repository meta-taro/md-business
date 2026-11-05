import {
  describeFrontmatterError,
  editionWarnings,
  hasRevisionMarks,
  parseMarkdown,
  revisionHistoryWarnings,
  type DocumentEdition,
  type RevisionView,
} from '@md-business/core';
import { createDefaultRegistry, type SchemaPlugin, type PluginRegistry } from '../plugins/index.js';
import { frontmatterHint } from './frontmatterHint.js';
import type { ValidationError } from '@md-business/core';

export interface LoadedDocument {
  plugin: SchemaPlugin;
  frontmatter: Record<string, unknown>;
}

export interface LoadMarkdownSuccess {
  ok: true;
  bodyHtml: string;
  stylesHref: string;
  documentTitle: string;
  /**
   * Suggested PDF save filename. Viewer sets `document.title` to this value
   * just before opening the print dialog; Chrome uses it as the default
   * filename in "Save as PDF". Falls back to `documentTitle` if the plugin
   * does not implement `pdfFileName()`.
   */
  pdfFileName: string;
  pluginId: string;
  /**
   * Non-fatal warnings collected by the plugin (e.g. autofill mismatch
   * between supplied totals and computed totals). Already translated to
   * Japanese user-facing messages by the plugin.
   */
  warnings: string[];
  /** The document differs between the internal and submission editions. */
  editionAware: boolean;
  /** The body has revision marks, so marked / clean differ. */
  revisionAware: boolean;
}

export interface LoadMarkdownFailure {
  ok: false;
  reason: string;
  details?: string[];
  /** Warnings from upstream passes (normalize/autofill) shown alongside errors. */
  warnings?: string[];
}

export type LoadMarkdownResult = LoadMarkdownSuccess | LoadMarkdownFailure;

export interface LoadMarkdownOptions {
  registry?: PluginRegistry;
  /** Explicit plugin id (overrides frontmatter detection). */
  pluginId?: string;
  /** Which edition to build. Defaults to the internal edition. */
  edition?: DocumentEdition;
  /** Show revision marks (default) or build the clean copy. Independent of the edition. */
  revisions?: RevisionView;
}

/**
 * Parse a Markdown source, validate frontmatter against the matching plugin's
 * precompiled validator, and return the body HTML + the stylesheet href needed
 * to render it.
 *
 * Runtime constraints (MV3 CSP — `script-src 'self'`):
 *   - YAML parsing goes through `splitFrontmatter` (js-yaml, no eval).
 *   - Validation goes through each plugin's standalone-compiled Ajv validator
 *     (no runtime `new Function()`).
 *
 * Pure (no DOM access) — safe to unit test in node.
 */
export function loadMarkdown(source: string, options: LoadMarkdownOptions = {}): LoadMarkdownResult {
  const registry = options.registry ?? createDefaultRegistry();

  let frontmatter: Record<string, unknown>;
  let markdownBody: string;
  try {
    const parsed = parseMarkdown(source);
    frontmatter = parsed.data;
    markdownBody = parsed.body;
  } catch (error: unknown) {
    return {
      ok: false,
      reason: 'Markdown の frontmatter を解析できませんでした。',
      details: [frontmatterHint(describeFrontmatterError(error))],
    };
  }

  const explicit = options.pluginId ? registry.get(options.pluginId) : undefined;
  const plugin = explicit ?? registry.resolve(frontmatter);
  if (!plugin) {
    return {
      ok: false,
      reason: '対応するスキーマが見つかりませんでした。',
      details: [
        'frontmatter の先頭に `schemaVersion: "invoice/v1"` または `schema: invoice` を追加してください。',
        '請求書テンプレートを参考にする場合は templates/invoice/standard-ja.md を参照してください。',
      ],
    };
  }

  const validated = plugin.validate(frontmatter);
  if (!validated.ok) {
    // Plugin is responsible for translating its own errors to user-facing
    // language. We pass `message` through verbatim — for the invoice plugin
    // these are already Japanese sentences like "請求先の名前は必須項目です".
    return {
      ok: false,
      reason: `${plugin.label} の Markdown に不備があります。`,
      details: validated.errors.map((e) => e.message),
      warnings: validated.warnings ?? [],
    };
  }

  const edition = options.edition ?? 'internal';
  const revisions = options.revisions ?? 'marked';
  const editionAware = plugin.editionAware?.(frontmatter, markdownBody) ?? false;
  const revisionAware = plugin.proseBody === true && hasRevisionMarks(markdownBody);
  const documentTitle = plugin.documentTitle?.(validated.data) ?? plugin.label;
  const pdfFileName = plugin.pdfFileName?.(validated.data, edition) ?? documentTitle;
  return {
    ok: true,
    bodyHtml: plugin.render(validated.data, markdownBody, edition, revisions),
    stylesHref: plugin.stylesHref,
    documentTitle,
    pdfFileName,
    pluginId: plugin.id,
    warnings: [
      ...(validated.warnings ?? []),
      ...(editionAware ? editionWarnings(markdownBody, edition) : []),
      ...revisionHistoryWarnings(frontmatter, markdownBody),
    ],
    editionAware,
    revisionAware,
  };
}

/**
 * Result of `previewMarkdown` — the editor pane consumes this to keep the
 * preview filled while the author is still typing. `bodyHtml` is always a
 * string (possibly empty); `errors` describes what is still wrong so the
 * editor can hint at fixes without blocking the render.
 */
export interface PreviewMarkdownSuccess {
  ok: true;
  bodyHtml: string;
  stylesHref: string;
  pluginId: string;
  errors: ValidationError[];
  warnings: string[];
  fatal?: string;
  /** The document differs between the internal and submission editions. */
  editionAware: boolean;
  /** The body has revision marks, so marked / clean differ. */
  revisionAware: boolean;
}

export interface PreviewMarkdownFailure {
  ok: false;
  reason: string;
  details?: string[];
}

export type PreviewMarkdownResult = PreviewMarkdownSuccess | PreviewMarkdownFailure;

/**
 * Permissive version of `loadMarkdown` for the live editor preview. Unlike
 * the strict path used by "PDF をダウンロード", this:
 *   - returns rendered HTML even when validation fails
 *   - surfaces validation errors as a side channel for the editor UI
 *   - never blocks on missing required fields (uses safe structural defaults)
 *
 * Still fails fast when the source has no parseable frontmatter or no
 * matching plugin — those are author-fixable but not "still typing" states.
 */
export function previewMarkdown(
  source: string,
  options: LoadMarkdownOptions = {},
): PreviewMarkdownResult {
  const registry = options.registry ?? createDefaultRegistry();

  let frontmatter: Record<string, unknown>;
  let markdownBody: string;
  try {
    const parsed = parseMarkdown(source);
    frontmatter = parsed.data;
    markdownBody = parsed.body;
  } catch (error: unknown) {
    return {
      ok: false,
      reason: 'Markdown の frontmatter を解析できませんでした。',
      details: [frontmatterHint(describeFrontmatterError(error))],
    };
  }

  const explicit = options.pluginId ? registry.get(options.pluginId) : undefined;
  const plugin = explicit ?? registry.resolve(frontmatter);
  if (!plugin) {
    return {
      ok: false,
      reason: '対応するスキーマが見つかりませんでした。',
      details: [
        'frontmatter の先頭に `schemaVersion: "invoice/v1"` または `schema: invoice` を追加してください。',
      ],
    };
  }

  // Plugins that opt into permissive preview supply `previewRender`. Fall back
  // to the strict path when one is not available — older plugins still work
  // (they just block on validation errors).
  const edition = options.edition ?? 'internal';
  const revisions = options.revisions ?? 'marked';
  const editionAware = plugin.editionAware?.(frontmatter, markdownBody) ?? false;
  const revisionAware = plugin.proseBody === true && hasRevisionMarks(markdownBody);
  const leaks = [
    ...(editionAware ? editionWarnings(markdownBody, edition) : []),
    ...revisionHistoryWarnings(frontmatter, markdownBody),
  ];
  if (plugin.previewRender) {
    const result = plugin.previewRender(frontmatter, markdownBody, edition, revisions);
    return {
      ok: true,
      bodyHtml: result.html,
      stylesHref: plugin.stylesHref,
      pluginId: plugin.id,
      errors: result.errors,
      warnings: [...result.warnings, ...leaks],
      ...(result.fatal ? { fatal: result.fatal } : {}),
      editionAware,
      revisionAware,
    };
  }
  const validated = plugin.validate(frontmatter);
  return {
    ok: true,
    bodyHtml: validated.ok ? plugin.render(validated.data, markdownBody, edition, revisions) : '',
    stylesHref: plugin.stylesHref,
    pluginId: plugin.id,
    errors: validated.ok ? [] : validated.errors,
    warnings: [...(validated.warnings ?? []), ...leaks],
    editionAware,
    revisionAware,
  };
}
