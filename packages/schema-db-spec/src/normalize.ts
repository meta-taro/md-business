import {
  DB_SPEC_JA_DICTIONARY,
  STATUS_TRANSLATIONS,
  ENGINE_TRANSLATIONS,
  THEME_VALUE_TRANSLATIONS,
  type DbSpecDictionaryScope,
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
 * shape expected by `dbSpecSchema`. Returns the translated object plus any
 * non-fatal warnings (key collisions, etc).
 *
 * Unknown keys pass through verbatim — Ajv's `additionalProperties: false`
 * surfaces them as schema errors with full path context. Column `type`
 * expressions are never translated (PdM decision B-2: engine-native SQL
 * notation is canonical).
 */
export function normalizeDbSpecFrontmatter(input: unknown): NormalizeResult {
  const warnings: NormalizeWarning[] = [];
  if (!isPlainObject(input)) {
    return { data: {}, warnings };
  }
  const data = translateScope(input, 'root', '', warnings);
  return { data: data as Record<string, unknown>, warnings };
}

function translateScope(
  value: unknown,
  scope: DbSpecDictionaryScope,
  path: string,
  warnings: NormalizeWarning[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, idx) =>
      translateScope(entry, scope, `${path}[${idx}]`, warnings),
    );
  }
  if (!isPlainObject(value)) return value;

  const dict = DB_SPEC_JA_DICTIONARY[scope];
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
  scope: DbSpecDictionaryScope,
  key: string,
  value: unknown,
  childScope: DbSpecDictionaryScope | null,
  path: string,
  warnings: NormalizeWarning[],
): unknown {
  if (scope === 'root' && typeof value === 'string') {
    if (key === 'status') return STATUS_TRANSLATIONS[value.trim()] ?? value.trim();
    if (key === 'engine') return ENGINE_TRANSLATIONS[value.trim()] ?? value.trim();
    if (key === 'theme') return THEME_VALUE_TRANSLATIONS[value.trim()] ?? value.trim();
  }
  if (childScope) {
    return translateScope(value, childScope, path, warnings);
  }
  return value;
}

function childScopeFor(
  parent: DbSpecDictionaryScope,
  key: string,
): DbSpecDictionaryScope | null {
  if (parent === 'root') {
    switch (key) {
      case 'authors':
      case 'reviewers':
        return 'party';
      case 'tables':
        return 'table';
      case 'migrations':
        return 'migration';
      default:
        return null;
    }
  }
  if (parent === 'table') {
    switch (key) {
      case 'columns':
        return 'column';
      case 'indexes':
        return 'index';
      case 'triggers':
        return 'trigger';
      default:
        return null;
    }
  }
  // column.fk is a single nested object; index.columns stays a verbatim
  // string array, so no child scope is declared for it.
  if (parent === 'column' && key === 'fk') {
    return 'fk';
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
