import { parseMarkdown } from '@md-business/core';
import { createDefaultRegistry, type SchemaPlugin, type PluginRegistry } from '../plugins/index.js';

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
}

export interface LoadMarkdownFailure {
  ok: false;
  reason: string;
  details?: string[];
}

export type LoadMarkdownResult = LoadMarkdownSuccess | LoadMarkdownFailure;

export interface LoadMarkdownOptions {
  registry?: PluginRegistry;
  /** Explicit plugin id (overrides frontmatter detection). */
  pluginId?: string;
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
  try {
    frontmatter = parseMarkdown(source).data;
  } catch (error: unknown) {
    return {
      ok: false,
      reason: 'Markdown frontmatter could not be parsed.',
      details: [error instanceof Error ? error.message : String(error)],
    };
  }

  const explicit = options.pluginId ? registry.get(options.pluginId) : undefined;
  const plugin = explicit ?? registry.resolve(frontmatter);
  if (!plugin) {
    return {
      ok: false,
      reason: 'No matching schema plugin found.',
      details: [
        'Add `schema: invoice` (or another registered id) to the frontmatter, or set `schemaVersion: "invoice/v1"`.',
      ],
    };
  }

  const validated = plugin.validate(frontmatter);
  if (!validated.ok) {
    return {
      ok: false,
      reason: `Validation failed against ${plugin.label}.`,
      details: validated.errors.map((e) => `${e.path}: ${e.message}`),
    };
  }

  const documentTitle = plugin.documentTitle?.(validated.data) ?? plugin.label;
  const pdfFileName = plugin.pdfFileName?.(validated.data) ?? documentTitle;
  return {
    ok: true,
    bodyHtml: plugin.render(validated.data),
    stylesHref: plugin.stylesHref,
    documentTitle,
    pdfFileName,
    pluginId: plugin.id,
  };
}
