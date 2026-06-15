import { parseAndValidate } from '@md-business/core';
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
 * Parse a Markdown source, validate frontmatter against the matching plugin's schema,
 * and return the body HTML + the stylesheet href needed to render it.
 *
 * Pure (no DOM access) — safe to unit test in node.
 */
export function loadMarkdown(source: string, options: LoadMarkdownOptions = {}): LoadMarkdownResult {
  const registry = options.registry ?? createDefaultRegistry();

  // First parse without schema to look at frontmatter and pick a plugin.
  const probe = parseAndValidate<Record<string, unknown>>(source, { type: 'object' });
  if (!probe.ok) {
    return {
      ok: false,
      reason: 'Markdown frontmatter could not be parsed.',
      details: probe.errors.map((e) => `${e.path}: ${e.message}`),
    };
  }

  const explicit = options.pluginId ? registry.get(options.pluginId) : undefined;
  const plugin = explicit ?? registry.resolve(probe.frontmatter);
  if (!plugin) {
    return {
      ok: false,
      reason: 'No matching schema plugin found.',
      details: [
        'Add `schema: invoice` (or another registered id) to the frontmatter, or set `schemaVersion: "invoice/v1"`.',
      ],
    };
  }

  // Re-validate against the chosen plugin's schema.
  const validated = parseAndValidate<Record<string, unknown>>(source, plugin.schema);
  if (!validated.ok) {
    return {
      ok: false,
      reason: `Validation failed against ${plugin.label}.`,
      details: validated.errors.map((e) => `${e.path}: ${e.message}`),
    };
  }

  return {
    ok: true,
    bodyHtml: plugin.render(validated.frontmatter),
    stylesHref: plugin.stylesHref,
    documentTitle: plugin.documentTitle?.(validated.frontmatter) ?? plugin.label,
    pluginId: plugin.id,
  };
}
