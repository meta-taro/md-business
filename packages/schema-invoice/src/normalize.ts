import { MAX_FRONTMATTER_DEPTH } from '@md-business/core';
import {
  INVOICE_JA_DICTIONARY,
  TAX_ROUNDING_TRANSLATIONS,
  ACCOUNT_TYPE_TRANSLATIONS,
  THEME_VALUE_TRANSLATIONS,
  DOCUMENT_TYPE_TRANSLATIONS,
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
  // This function is exported through `normalizeInvoiceFrontmatter`, so callers
  // can reach it without the parse entry point's structural check. Carry the
  // value through untranslated once the nesting gets implausibly deep: the
  // schema check that follows still rejects it, and this walk stays inside the
  // call stack.
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
  if (key === 'documentType' && typeof value === 'string') {
    // 未知の値はそのまま通す。スキーマの enum が弾いて、どの値が駄目だったかを
    // 著者に見せる（ここで請求書へ倒すと、誤字が黙って請求書として発行される）。
    return DOCUMENT_TYPE_TRANSLATIONS[value.trim()] ?? value.trim();
  }
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
    return translateScope(value, childScope, path, warnings, depth + 1);
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
