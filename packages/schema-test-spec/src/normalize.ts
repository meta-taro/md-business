import {
  TEST_SPEC_JA_DICTIONARY,
  STATUS_TRANSLATIONS,
  COLUMN_TYPE_TRANSLATIONS,
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
 * Translate a Japanese-keyed frontmatter object into the canonical English
 * shape expected by `testSpecSchema`. Returns the translated object plus any
 * non-fatal warnings (key collisions, etc).
 *
 * Unknown keys pass through verbatim — Ajv's `additionalProperties: false`
 * surfaces them as schema errors with full path context.
 */
export function normalizeTestSpecFrontmatter(input: unknown): NormalizeResult {
  const warnings: NormalizeWarning[] = [];
  if (!isPlainObject(input)) {
    return { data: {}, warnings };
  }
  const data = translateScope(input, 'root', '', warnings);
  return { data: data as Record<string, unknown>, warnings };
}

function translateScope(
  value: unknown,
  scope: DictionaryScope,
  path: string,
  warnings: NormalizeWarning[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, idx) =>
      translateScope(entry, scope, `${path}[${idx}]`, warnings),
    );
  }
  if (!isPlainObject(value)) return value;

  const dict = TEST_SPEC_JA_DICTIONARY[scope];
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
    out[targetKey] = translateLeaf(targetKey, rawValue, childScope, childPath, warnings);
  }
  return out;
}

function translateLeaf(
  key: string,
  value: unknown,
  childScope: DictionaryScope | null,
  path: string,
  warnings: NormalizeWarning[],
): unknown {
  if (key === 'status' && typeof value === 'string') {
    return STATUS_TRANSLATIONS[value.trim()] ?? value.trim();
  }
  if (key === 'type' && typeof value === 'string') {
    return COLUMN_TYPE_TRANSLATIONS[value.trim()] ?? value.trim();
  }
  if (key === 'theme' && typeof value === 'string') {
    return THEME_VALUE_TRANSLATIONS[value.trim()] ?? value.trim();
  }
  // column.visual is dict-of-visualStyle: outer keys are enum values
  // (untranslated), inner entries are visualStyle objects.
  if (key === 'visual' && isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [styleKey, styleVal] of Object.entries(value)) {
      out[styleKey] = translateScope(
        styleVal,
        'visualStyle',
        `${path}.${styleKey}`,
        warnings,
      );
    }
    return out;
  }
  if (childScope) {
    return translateScope(value, childScope, path, warnings);
  }
  return value;
}

function childScopeFor(parent: DictionaryScope, key: string): DictionaryScope | null {
  if (parent === 'root') {
    switch (key) {
      case 'authors':
      case 'reviewers':
        return 'party';
      case 'columns':
        return 'column';
      default:
        return null;
    }
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
