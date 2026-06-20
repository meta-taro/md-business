import type { SchemaPlugin } from './types.js';

export class PluginRegistry {
  private readonly plugins = new Map<string, SchemaPlugin>();

  register(plugin: SchemaPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`SchemaPlugin already registered: ${plugin.id}`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  get(id: string): SchemaPlugin | undefined {
    return this.plugins.get(id);
  }

  list(): readonly SchemaPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Resolve which plugin to use for a parsed Markdown document.
   *
   * Order:
   *   1. explicit `schema:` field in frontmatter
   *      - direct match  (e.g. "invoice")        → invoice plugin
   *      - prefix match  (e.g. "test-spec/v1")   → test-spec plugin
   *   2. `schemaVersion:` prefix (e.g. "invoice/v1" → "invoice")
   *   3. plugin.detect() heuristics on marker keys
   *   4. default fallback (undefined → caller decides)
   *
   * The `schema: <id>/<v>` prefix path was added in v0.7.0 for the test-spec
   * plugin, whose canonical frontmatter ships `schema: "test-spec/v1"` (no
   * separate `schemaVersion` field).
   */
  resolve(frontmatter: Record<string, unknown>): SchemaPlugin | undefined {
    const schemaField = frontmatter['schema'];
    if (typeof schemaField === 'string') {
      if (this.plugins.has(schemaField)) {
        return this.plugins.get(schemaField);
      }
      const prefix = schemaField.split('/')[0];
      if (prefix && this.plugins.has(prefix)) return this.plugins.get(prefix);
    }
    const schemaVersion = frontmatter['schemaVersion'];
    if (typeof schemaVersion === 'string') {
      const id = schemaVersion.split('/')[0];
      if (id && this.plugins.has(id)) return this.plugins.get(id);
    }
    // Fall back to plugin-defined heuristics — lets authors write a pure
    // Japanese frontmatter (no schemaVersion / schema field) and still get
    // auto-routed to the right schema plugin.
    for (const plugin of this.plugins.values()) {
      if (plugin.detect?.(frontmatter)) return plugin;
    }
    return undefined;
  }
}
