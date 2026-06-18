import { PluginRegistry } from './registry.js';
import { invoicePlugin } from './invoice.js';
import { specPlugin } from './spec.js';
import { testSpecPlugin } from './test-spec.js';

export { PluginRegistry };
export type { SchemaPlugin } from './types.js';
export { invoicePlugin };
export { specPlugin };
export { testSpecPlugin };

/**
 * Build the default registry shipped with the extension.
 *
 * Registration order matters for `detect()`-based heuristic resolution:
 * earlier-registered plugins win. test-spec is registered before spec
 * because test-spec markers (`列` / `columns` / `シートID`) are stricter
 * than spec's broader `文書番号` / `documentNumber` claim — a doc that
 * has BOTH should route to test-spec.
 */
export function createDefaultRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registry.register(invoicePlugin);
  registry.register(testSpecPlugin);
  registry.register(specPlugin);
  return registry;
}
