import { PluginRegistry } from './registry.js';
import { invoicePlugin } from './invoice.js';
import { specPlugin } from './spec.js';
import { testSpecPlugin } from './test-spec.js';
import { dbSpecPlugin } from './db-spec.js';
import { nosqlDbSpecPlugin } from './nosql-db-spec.js';
import { apiSpecPlugin } from './api-spec.js';

export { PluginRegistry };
export type { SchemaPlugin } from './types.js';
export { invoicePlugin };
export { specPlugin };
export { testSpecPlugin };
export { dbSpecPlugin };
export { nosqlDbSpecPlugin };
export { apiSpecPlugin };

/**
 * Build the default registry shipped with the extension.
 *
 * Registration order matters for `detect()`-based heuristic resolution:
 * earlier-registered plugins win. test-spec is registered before spec
 * because test-spec markers (`列` / `columns` / `シートID`) are stricter
 * than spec's broader `文書番号` / `documentNumber` claim — a doc that
 * has BOTH should route to test-spec.
 *
 * db-spec / nosql-db-spec are likewise registered before spec: a DB 設計書
 * carries `documentNumber` / `reviewers` (which spec also claims), so their
 * stricter markers (`tables` / `テーブル` and `collections` / `コレクション`)
 * must be evaluated first to win the route. db-spec / nosql-db-spec / api-spec
 * do not collide with each other (disjoint markers: `tables` / `テーブル`,
 * `collections` / `コレクション`, `endpoints` / `エンドポイント`).
 */
export function createDefaultRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registry.register(invoicePlugin);
  registry.register(testSpecPlugin);
  registry.register(dbSpecPlugin);
  registry.register(nosqlDbSpecPlugin);
  registry.register(apiSpecPlugin);
  registry.register(specPlugin);
  return registry;
}
