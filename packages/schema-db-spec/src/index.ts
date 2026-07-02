export { dbSpecSchema, SCHEMA_VERSION } from './schema.js';
export type {
  DbSpec,
  DbSpecStatus,
  DbSpecEngine,
  DbSpecPerson,
  DbSpecTable,
  DbSpecColumn,
  DbSpecForeignKey,
  ForeignKeyAction,
  DbSpecIndex,
  IndexUsing,
  DbSpecTrigger,
  DbSpecMigration,
} from './types.js';
export { normalizeDbSpecFrontmatter } from './normalize.js';
export type { NormalizeWarning, NormalizeResult } from './normalize.js';
export { autofillDbSpec } from './autofill.js';
export type { AutofillWarning, AutofillResult } from './autofill.js';
export {
  translateDbSpecError,
  translateDbSpecErrors,
  translateDbSpecWarning,
  translateDbSpecWarnings,
} from './translateError.js';
export { renderDbSpecFileName } from './fileName.js';
export { parseDbSpecMarkdown, parseDbSpecObject } from './parseDbSpec.js';
export type {
  DbSpecParseSuccess,
  DbSpecParseFailure,
  DbSpecParseResult,
} from './parseDbSpec.js';
export {
  DB_SPEC_JA_DICTIONARY,
  STATUS_TRANSLATIONS,
  ENGINE_TRANSLATIONS,
  THEME_VALUE_TRANSLATIONS,
} from './dictionary.ja.js';
export type { DbSpecDictionaryScope, DbSpecDictionary } from './dictionary.ja.js';
