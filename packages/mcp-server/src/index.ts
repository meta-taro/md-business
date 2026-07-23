export { safeRelativePath } from './workspacePath.js';
export type { SafePathResult, SafePathOk, SafePathRejected } from './workspacePath.js';

export {
  SCHEMA_REGISTRY,
  listSchemas,
  resolveSchema,
  detectSchemaId,
} from './registry.js';
export type { SchemaEntry } from './registry.js';

export { MemoryDocumentStore } from './store.js';
export type { DocumentStore } from './store.js';

export { diffLines } from './diff.js';
export type { DiffLine, DiffLineType } from './diff.js';

export { readDocument, validateDocument, createDocument, updateDocument } from './tools.js';
export type {
  ToolError,
  ReadDocumentOk,
  ValidateDocumentOk,
  CreateDocumentInput,
  CreateDocumentOk,
  UpdateDocumentInput,
  UpdateDocumentOk,
} from './tools.js';

export {
  searchDocuments,
  matchesQuery,
  extractTitle,
  extractDate,
  inDateRange,
  makeExcerpt,
} from './search.js';
export type { SearchQuery, SearchMatch, SearchDocumentsOk } from './search.js';
