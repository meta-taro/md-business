export { testSpecSchema, SCHEMA_VERSION } from './schema.js';
export type {
  TestSpec,
  TestSpecColumn,
  ColumnType,
  ColumnVisualStyle,
  TestSpecPerson,
  TestSpecStatus,
} from './types.js';
export { normalizeTestSpecFrontmatter } from './normalize.js';
export type { NormalizeWarning, NormalizeResult } from './normalize.js';
export { autofillTestSpec } from './autofill.js';
export type { AutofillWarning, AutofillResult } from './autofill.js';
export { parseTestSpecMarkdown, parseTestSpecObject } from './parseTestSpec.js';
export type {
  TestSpecParseResult,
  TestSpecParseSuccess,
  TestSpecParseFailure,
} from './parseTestSpec.js';
export {
  TEST_SPEC_JA_DICTIONARY,
  STATUS_TRANSLATIONS,
  COLUMN_TYPE_TRANSLATIONS,
  THEME_VALUE_TRANSLATIONS,
} from './dictionary.ja.js';
export type { DictionaryScope, Dictionary } from './dictionary.ja.js';
export {
  translateTestSpecError,
  translateTestSpecErrors,
  translateTestSpecWarning,
  translateTestSpecWarnings,
} from './translateError.js';
export { renderTestSpecFileName } from './fileName.js';
