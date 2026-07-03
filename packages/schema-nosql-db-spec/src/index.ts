export { nosqlDbSpecSchema, SCHEMA_VERSION } from './schema.js';
export type {
  NosqlDbSpec,
  NosqlDbSpecStatus,
  NosqlDbSpecEngine,
  NosqlDbSpecPerson,
  NosqlCollection,
  DocIdStrategy,
  NosqlFieldDef,
  NosqlFieldType,
  NosqlShape,
  NosqlIndex,
  NosqlIndexScope,
  NosqlIndexMode,
  NosqlTtl,
  NosqlSecurityRule,
  SecurityRuleAllow,
} from './types.js';
export { normalizeNosqlDbSpecFrontmatter } from './normalize.js';
export type { NormalizeWarning, NormalizeResult } from './normalize.js';
export { autofillNosqlDbSpec } from './autofill.js';
export type { AutofillWarning, AutofillResult } from './autofill.js';
export {
  translateNosqlDbSpecError,
  translateNosqlDbSpecErrors,
  translateNosqlDbSpecWarning,
  translateNosqlDbSpecWarnings,
} from './translateError.js';
export {
  NOSQL_DB_SPEC_JA_DICTIONARY,
  STATUS_TRANSLATIONS,
  ENGINE_TRANSLATIONS,
  DOC_ID_STRATEGY_TRANSLATIONS,
  FIELD_TYPE_TRANSLATIONS,
  INDEX_SCOPE_TRANSLATIONS,
  INDEX_MODE_TRANSLATIONS,
  ALLOW_VERB_TRANSLATIONS,
  THEME_VALUE_TRANSLATIONS,
} from './dictionary.ja.js';
export type {
  NosqlDbSpecDictionaryScope,
  NosqlDbSpecDictionary,
} from './dictionary.ja.js';
