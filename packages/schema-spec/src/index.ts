export { specSchema, SCHEMA_VERSION } from './schema.js';
export type { Spec, SpecPerson, SpecStatus, TocMode } from './types.js';
export { normalizeSpecFrontmatter } from './normalize.js';
export type { NormalizeWarning, NormalizeResult } from './normalize.js';
export { autofillSpec } from './autofill.js';
export type { AutofillWarning, AutofillResult } from './autofill.js';
export { renderSpecFileName } from './fileName.js';
export {
  translateSpecError,
  translateSpecErrors,
  translateSpecWarning,
  translateSpecWarnings,
} from './translateError.js';
export { parseSpecMarkdown, parseSpecObject } from './parseSpec.js';
export type { SpecParseResult, SpecParseSuccess, SpecParseFailure } from './parseSpec.js';
export {
  SPEC_JA_DICTIONARY,
  STATUS_TRANSLATIONS,
  TOC_TRANSLATIONS,
  THEME_VALUE_TRANSLATIONS,
} from './dictionary.ja.js';
export type { DictionaryScope, Dictionary } from './dictionary.ja.js';
