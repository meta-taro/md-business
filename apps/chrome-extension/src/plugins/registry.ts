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
   *   1. explicit `schema:` field in frontmatter (e.g. "invoice")
   *   2. `schemaVersion:` prefix (e.g. "invoice/v1" → "invoice")
   *   3. default fallback (undefined → caller decides)
   */
  resolve(frontmatter: Record<string, unknown>): SchemaPlugin | undefined {
    const schemaField = frontmatter['schema'];
    if (typeof schemaField === 'string' && this.plugins.has(schemaField)) {
      return this.plugins.get(schemaField);
    }
    const schemaVersion = frontmatter['schemaVersion'];
    if (typeof schemaVersion === 'string') {
      const id = schemaVersion.split('/')[0];
      if (id && this.plugins.has(id)) return this.plugins.get(id);
    }
    return undefined;
  }
}
