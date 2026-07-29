import { MAX_FRONTMATTER_DEPTH } from '@md-business/core';
import {
  NOSQL_DB_SPEC_JA_DICTIONARY,
  STATUS_TRANSLATIONS,
  ENGINE_TRANSLATIONS,
  DOC_ID_STRATEGY_TRANSLATIONS,
  FIELD_TYPE_TRANSLATIONS,
  INDEX_SCOPE_TRANSLATIONS,
  INDEX_MODE_TRANSLATIONS,
  ALLOW_VERB_TRANSLATIONS,
  THEME_VALUE_TRANSLATIONS,
  type NosqlDbSpecDictionaryScope,
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
 * shape expected by `nosqlDbSpecSchema`. Returns the translated object plus
 * any non-fatal warnings (key collisions, etc).
 *
 * Unknown keys pass through verbatim — Ajv's `additionalProperties: false`
 * surfaces them as schema errors with full path context. Special regions:
 *
 * - `shape` maps: field NAMES stay verbatim (user data); only the fieldDef
 *   objects behind them are translated.
 * - `path` values keep `{placeholder}` segments verbatim (C-2).
 * - `engineSpecific` passes through completely untranslated (C-5 escape hatch).
 */
export function normalizeNosqlDbSpecFrontmatter(input: unknown): NormalizeResult {
  const warnings: NormalizeWarning[] = [];
  if (!isPlainObject(input)) {
    return { data: {}, warnings };
  }
  const data = translateScope(input, 'root', '', warnings, 1);
  return { data: data as Record<string, unknown>, warnings };
}

function translateScope(
  value: unknown,
  scope: NosqlDbSpecDictionaryScope,
  path: string,
  warnings: NormalizeWarning[],
  depth: number,
): unknown {
  // `fieldDef.of` names another field definition, so the input can chain them
  // without end. Carry the value through untranslated once the chain gets
  // implausibly long: the schema check that follows still rejects it, and this
  // walk stays inside the call stack.
  if (depth > MAX_FRONTMATTER_DEPTH) {
    warnings.push({
      path,
      message: `Value is nested too deeply (limit ${MAX_FRONTMATTER_DEPTH}) and was left untranslated.`,
    });
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, idx) =>
      translateScope(entry, scope, `${path}[${idx}]`, warnings, depth + 1),
    );
  }
  if (!isPlainObject(value)) return value;

  const dict = NOSQL_DB_SPEC_JA_DICTIONARY[scope];
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

    safeSet(
      out,
      targetKey,
      translateLeaf(scope, targetKey, rawValue, childPath, warnings, depth),
    );
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
  scope: NosqlDbSpecDictionaryScope,
  key: string,
  value: unknown,
  path: string,
  warnings: NormalizeWarning[],
  depth: number,
): unknown {
  if (typeof value === 'string') {
    const translated = translateStringValue(scope, key, value.trim());
    if (translated !== null) return translated;
  }

  if (scope === 'securityRule' && key === 'allow' && Array.isArray(value)) {
    return value.map((v) =>
      typeof v === 'string' ? (ALLOW_VERB_TRANSLATIONS[v.trim()] ?? v.trim()) : v,
    );
  }

  // shape maps: keys are user field names (verbatim); values are fieldDefs.
  if ((scope === 'collection' || scope === 'fieldDef') && key === 'shape') {
    return translateShape(value, path, warnings, depth);
  }

  // engineSpecific is an untranslated escape hatch (C-5).
  if (scope === 'collection' && key === 'engineSpecific') {
    return value;
  }

  const childScope = childScopeFor(scope, key);
  if (childScope) {
    return translateScope(value, childScope, path, warnings, depth + 1);
  }
  return value;
}

function translateStringValue(
  scope: NosqlDbSpecDictionaryScope,
  key: string,
  value: string,
): string | null {
  if (scope === 'root') {
    if (key === 'status') return STATUS_TRANSLATIONS[value] ?? value;
    if (key === 'engine') return ENGINE_TRANSLATIONS[value] ?? value;
    if (key === 'theme') return THEME_VALUE_TRANSLATIONS[value] ?? value;
  }
  if (scope === 'collection' && key === 'docIdStrategy') {
    return DOC_ID_STRATEGY_TRANSLATIONS[value] ?? value;
  }
  if (scope === 'fieldDef' && key === 'type') {
    return FIELD_TYPE_TRANSLATIONS[value] ?? value;
  }
  if (scope === 'index') {
    if (key === 'scope') return INDEX_SCOPE_TRANSLATIONS[value] ?? value;
    if (key === 'mode') return INDEX_MODE_TRANSLATIONS[value] ?? value;
  }
  return null;
}

function translateShape(
  value: unknown,
  path: string,
  warnings: NormalizeWarning[],
  depth: number,
): unknown {
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [fieldName, fieldDef] of Object.entries(value)) {
    // Shape field names are author-controlled and bypass the dictionary, so a
    // field literally named `__proto__` would otherwise pollute the prototype.
    safeSet(
      out,
      fieldName,
      translateScope(fieldDef, 'fieldDef', `${path}.${fieldName}`, warnings, depth + 1),
    );
  }
  return out;
}

function childScopeFor(
  parent: NosqlDbSpecDictionaryScope,
  key: string,
): NosqlDbSpecDictionaryScope | null {
  if (parent === 'root') {
    switch (key) {
      case 'authors':
      case 'reviewers':
        return 'party';
      case 'collections':
        return 'collection';
      case 'securityRules':
        return 'securityRule';
      default:
        return null;
    }
  }
  if (parent === 'collection') {
    switch (key) {
      case 'indexes':
        return 'index';
      case 'ttl':
        return 'ttl';
      default:
        return null;
    }
  }
  // fieldDef.of is a single nested field definition (array element type).
  if (parent === 'fieldDef' && key === 'of') {
    return 'fieldDef';
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
