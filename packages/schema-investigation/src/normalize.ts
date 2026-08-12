import { MAX_FRONTMATTER_DEPTH } from '@md-business/core';
import {
  INVESTIGATION_JA_DICTIONARY,
  KIND_TRANSLATIONS,
  STATUS_TRANSLATIONS,
  SEVERITY_TRANSLATIONS,
  THEME_VALUE_TRANSLATIONS,
  type DictionaryScope,
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
 * Translate a Japanese-keyed frontmatter object into the canonical
 * English-keyed shape expected by `investigationSchema`. Returns the translated
 * object plus any non-fatal warnings (key collisions, values nested too deeply).
 *
 * Unknown keys are passed through verbatim — Ajv's `additionalProperties:
 * false` then surfaces them as schema errors with full path context.
 */
export function normalizeInvestigationFrontmatter(input: unknown): NormalizeResult {
  const warnings: NormalizeWarning[] = [];
  if (!isPlainObject(input)) {
    return { data: {}, warnings };
  }
  const data = translateScope(input, 'root', '', warnings, 1);
  return { data: data as Record<string, unknown>, warnings };
}

function translateScope(
  value: unknown,
  scope: DictionaryScope,
  path: string,
  warnings: NormalizeWarning[],
  depth: number,
): unknown {
  // Carry the value through untranslated once the nesting gets implausibly
  // deep: the schema check that follows still rejects it, and this walk stays
  // inside the call stack.
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

  const dict = INVESTIGATION_JA_DICTIONARY[scope];
  const out: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of Object.entries(value)) {
    const targetKey = dict[rawKey] ?? rawKey;
    const childPath = path ? `${path}.${targetKey}` : targetKey;

    if (Object.prototype.hasOwnProperty.call(out, targetKey)) {
      warnings.push({
        path: childPath,
        message: `Multiple input keys mapped to "${targetKey}" — the later occurrence wins. Use a single canonical key.`,
      });
    }

    const childScope = childScopeFor(scope, targetKey);
    out[targetKey] = translateLeaf(targetKey, rawValue, childScope, childPath, warnings, depth);
  }
  return out;
}

function translateLeaf(
  key: string,
  value: unknown,
  childScope: DictionaryScope | null,
  path: string,
  warnings: NormalizeWarning[],
  depth: number,
): unknown {
  if (typeof value === 'string') {
    const table = VALUE_TRANSLATIONS[key];
    if (table) {
      const trimmed = value.trim();
      return table[trimmed] ?? trimmed;
    }
  }
  if (childScope) {
    return translateScope(value, childScope, path, warnings, depth + 1);
  }
  return value;
}

/** Enum-valued keys, mapped to the table that translates their values. */
const VALUE_TRANSLATIONS: Record<string, Record<string, string> | undefined> = {
  kind: KIND_TRANSLATIONS,
  status: STATUS_TRANSLATIONS,
  severity: SEVERITY_TRANSLATIONS,
  theme: THEME_VALUE_TRANSLATIONS,
};

function childScopeFor(parent: DictionaryScope, key: string): DictionaryScope | null {
  if (parent !== 'root') return null;
  switch (key) {
    case 'authors':
    case 'reviewers':
      return 'person';
    case 'targets':
      return 'target';
    case 'tools':
      return 'tool';
    case 'window':
      return 'window';
    case 'findings':
      return 'finding';
    default:
      return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
