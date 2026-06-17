import { PluginRegistry } from './registry.js';
import { invoicePlugin } from './invoice.js';
import { specPlugin } from './spec.js';

export { PluginRegistry };
export type { SchemaPlugin } from './types.js';
export { invoicePlugin };
export { specPlugin };

/** Build the default registry shipped with the extension. */
export function createDefaultRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registry.register(invoicePlugin);
  registry.register(specPlugin);
  return registry;
}
