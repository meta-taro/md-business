import {
  API_SPEC_JA_DICTIONARY,
  STATUS_TRANSLATIONS,
  PROTOCOL_TRANSLATIONS,
  AUTH_TRANSLATIONS,
  METHOD_TRANSLATIONS,
  FIELD_TYPE_TRANSLATIONS,
  THEME_VALUE_TRANSLATIONS,
  type ApiSpecDictionaryScope,
} from './dictionary.ja.js';

export interface NormalizeWarning {
  path: string;
  message: string;
}

export interface NormalizeResult {
  data: Record<string, unknown>;
  warnings: NormalizeWarning[];
}

/**
 * Translate a Japanese-keyed frontmatter object into the canonical English
 * shape expected by `apiSpecSchema`. Returns the translated object plus any
 * non-fatal warnings (key collisions, etc).
 *
 * Unknown keys pass through verbatim — Ajv's `additionalProperties: false`
 * surfaces them as schema errors with full path context. Verbatim-carried
 * strings (path / summary / dbRef / format / errorRef / code / message) are
 * never translated; only structural keys and the status / protocol / auth /
 * method / field-type / theme value vocabularies are absorbed.
 */
export function normalizeApiSpecFrontmatter(input: unknown): NormalizeResult {
  const warnings: NormalizeWarning[] = [];
  if (!isPlainObject(input)) {
    return { data: {}, warnings };
  }
  const data = translateScope(input, 'root', '', warnings);
  return { data: data as Record<string, unknown>, warnings };
}

function translateScope(
  value: unknown,
  scope: ApiSpecDictionaryScope,
  path: string,
  warnings: NormalizeWarning[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, idx) =>
      translateScope(entry, scope, `${path}[${idx}]`, warnings),
    );
  }
  if (!isPlainObject(value)) return value;

  const dict = API_SPEC_JA_DICTIONARY[scope];
  const out: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of Object.entries(value)) {
    // hasOwnProperty guard: a raw key of `__proto__` must NOT resolve to the
    // inherited `Object.prototype` accessor value from the dictionary lookup.
    const mapped = Object.prototype.hasOwnProperty.call(dict, rawKey)
      ? dict[rawKey]
      : undefined;
    const targetKey = mapped ?? rawKey;
    const childPath = path ? `${path}.${targetKey}` : targetKey;

    if (Object.prototype.hasOwnProperty.call(out, targetKey)) {
      warnings.push({
        path: childPath,
        message: `Multiple input keys mapped to "${targetKey}" — the later occurrence wins. Use a single canonical key.`,
      });
    }

    const childScope = childScopeFor(scope, targetKey);
    safeSet(out, targetKey, translateLeaf(scope, targetKey, rawValue, childScope, childPath, warnings));
  }
  return out;
}

/**
 * Assign `value` under `key` as an own data property, even when `key` is
 * `__proto__`. Plain `out[key] = value` would invoke the `__proto__` accessor
 * and swap the object's prototype (prototype pollution) instead of storing the
 * value. `Object.defineProperty` stores it non-destructively — no pollution,
 * and no silent data loss for a legitimately (if unusually) named field.
 */
function safeSet(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function translateLeaf(
  scope: ApiSpecDictionaryScope,
  key: string,
  value: unknown,
  childScope: ApiSpecDictionaryScope | null,
  path: string,
  warnings: NormalizeWarning[],
): unknown {
  if (typeof value === 'string') {
    const translated = translateEnumValue(scope, key, value.trim());
    if (translated !== undefined) return translated;
  }
  if (childScope) {
    return translateScope(value, childScope, path, warnings);
  }
  return value;
}

/**
 * Absorb enum value vocabularies scoped to their owning key. Returns the
 * canonical value (or the trimmed input when the key is translatable but the
 * value is unknown — Ajv then rejects), or `undefined` when the key carries a
 * verbatim string that must not be touched.
 */
function translateEnumValue(
  scope: ApiSpecDictionaryScope,
  key: string,
  trimmed: string,
): string | undefined {
  if (scope === 'root') {
    if (key === 'status') return STATUS_TRANSLATIONS[trimmed] ?? trimmed;
    if (key === 'protocol') return PROTOCOL_TRANSLATIONS[trimmed] ?? trimmed;
    if (key === 'auth') return AUTH_TRANSLATIONS[trimmed] ?? trimmed;
    if (key === 'theme') return THEME_VALUE_TRANSLATIONS[trimmed] ?? trimmed;
  }
  if (scope === 'endpoint') {
    if (key === 'method') return METHOD_TRANSLATIONS[trimmed] ?? trimmed;
    if (key === 'auth') return AUTH_TRANSLATIONS[trimmed] ?? trimmed;
  }
  if (scope === 'field') {
    if (key === 'type') return FIELD_TYPE_TRANSLATIONS[trimmed] ?? trimmed;
  }
  return undefined;
}

function childScopeFor(
  parent: ApiSpecDictionaryScope,
  key: string,
): ApiSpecDictionaryScope | null {
  if (parent === 'root') {
    switch (key) {
      case 'authors':
      case 'reviewers':
        return 'party';
      case 'endpoints':
        return 'endpoint';
      case 'errors':
        return 'error';
      default:
        return null;
    }
  }
  if (parent === 'endpoint') {
    switch (key) {
      case 'request':
        return 'request';
      case 'responses':
        return 'response';
      default:
        return null;
    }
  }
  if (parent === 'request') {
    switch (key) {
      case 'pathParams':
      case 'queryParams':
      case 'headers':
        return 'field';
      case 'body':
        return 'body';
      default:
        return null;
    }
  }
  if (parent === 'response' && key === 'body') {
    return 'body';
  }
  if (parent === 'body' && key === 'fields') {
    return 'field';
  }
  // field.of holds nested field definitions (one level); tags stays a verbatim
  // string array so it declares no child scope.
  if (parent === 'field' && key === 'of') {
    return 'field';
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
