export { safeRelativePath } from './workspacePath.js';
export type { SafePathResult, SafePathOk, SafePathRejected } from './workspacePath.js';

export {
  SCHEMA_REGISTRY,
  listSchemas,
  resolveSchema,
  detectSchemaId,
} from './registry.js';
export type { SchemaEntry } from './registry.js';
