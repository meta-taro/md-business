import { PluginRegistry } from './registry.js';
import { invoicePlugin } from './invoice.js';

export { PluginRegistry };
export type { SchemaPlugin } from './types.js';
export { invoicePlugin };

/** Build the default registry shipped with the extension. */
export function createDefaultRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registry.register(invoicePlugin);
  return registry;
}
