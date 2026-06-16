import {
  INVOICE_JA_DICTIONARY,
  TAX_ROUNDING_TRANSLATIONS,
  ACCOUNT_TYPE_TRANSLATIONS,
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
 * English-keyed shape expected by `invoiceSchema`. Returns the translated
 * object plus any non-fatal warnings (key collisions, unknown keys).
 *
 * Unknown keys are passed through verbatim — Ajv's `additionalProperties:
 * false` then surfaces them as schema errors with full path context, which
 * is more useful than swallowing them here.
 */
export function normalizeInvoiceFrontmatter(input: unknown): NormalizeResult {
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
    return value.map((entry, idx) => translateScope(entry, scope, `${path}[${idx}]`, warnings));
  }
  if (!isPlainObject(value)) return value;

  const dict = INVOICE_JA_DICTIONARY[scope];
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
  if (key === 'taxRounding' && typeof value === 'string') {
    return TAX_ROUNDING_TRANSLATIONS[value] ?? value;
  }
  if (key === 'accountType' && typeof value === 'string') {
    return ACCOUNT_TYPE_TRANSLATIONS[value] ?? value;
  }
  if (key === 'theme' && typeof value === 'string') {
    return THEME_VALUE_TRANSLATIONS[value.trim()] ?? value.trim();
  }
  if (childScope) {
    return translateScope(value, childScope, path, warnings);
  }
  return value;
}

function childScopeFor(parent: DictionaryScope, key: string): DictionaryScope | null {
  if (parent === 'root') {
    switch (key) {
      case 'issuer':
      case 'recipient':
        return 'party';
      case 'items':
        return 'item';
      case 'paymentInfo':
        return 'payment';
      case 'stamp':
        return 'stamp';
      case 'taxSummary':
        return 'taxBucket';
      default:
        return null;
    }
  }
  if (parent === 'taxBucket') {
    // taxSummary.standard / .reduced / .exempt — children are bucket objects.
    return 'taxBucket';
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
