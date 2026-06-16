import type { TaxRate } from './types.js';

export type TaxRounding = 'floor' | 'round' | 'ceil';

export interface AutofillWarning {
  path: string;
  message: string;
}

export interface AutofillResult {
  data: Record<string, unknown>;
  warnings: AutofillWarning[];
}

/**
 * Fill in `taxSummary` and `totals` from `items[]` so authors only have to
 * write the line items. If the author also supplied a summary or totals
 * block, the computed values are diffed against the supplied ones and any
 * mismatch is emitted as a warning rather than silently overwritten — keeps
 * a hand-tuned override path open without burying calculation errors.
 *
 * Tax is computed per-rate (compliance with 適格請求書: one rounding step
 * per tax rate, not per line item). Default rounding is `floor`, which
 * matches the dominant B2B convention in Japan.
 *
 * Mutates a shallow clone; the original input is not modified.
 */
export function autofillInvoice(input: unknown): AutofillResult {
  const warnings: AutofillWarning[] = [];
  if (!isPlainObject(input)) return { data: {}, warnings };

  const data: Record<string, unknown> = { ...input };

  if (!data['schemaVersion']) data['schemaVersion'] = 'invoice/v1';

  const rounding = resolveRounding(data['taxRounding']);
  // Remove the directive so it doesn't leak past Ajv's additionalProperties:false.
  delete data['taxRounding'];

  const items = Array.isArray(data['items']) ? data['items'] : [];
  applyItemDefaults(items, warnings);

  const buckets = computeBuckets(items, rounding);

  const computedSummary = {
    standard: { rate: 10 as TaxRate, subtotal: buckets[10].subtotal, tax: buckets[10].tax },
    reduced: { rate: 8 as TaxRate, subtotal: buckets[8].subtotal, tax: buckets[8].tax },
    exempt: { rate: 0 as TaxRate, subtotal: buckets[0].subtotal, tax: buckets[0].tax },
  };

  const supplied = data['taxSummary'];
  if (supplied == null) {
    data['taxSummary'] = computedSummary;
  } else if (isPlainObject(supplied)) {
    diffSummary(supplied, computedSummary, warnings);
  }

  const computedTotals = {
    subtotal: buckets[10].subtotal + buckets[8].subtotal + buckets[0].subtotal,
    tax: buckets[10].tax + buckets[8].tax + buckets[0].tax,
    total:
      buckets[10].subtotal + buckets[8].subtotal + buckets[0].subtotal +
      buckets[10].tax + buckets[8].tax + buckets[0].tax,
  };

  const suppliedTotals = data['totals'];
  if (suppliedTotals == null) {
    data['totals'] = computedTotals;
  } else if (isPlainObject(suppliedTotals)) {
    diffTotals(suppliedTotals, computedTotals, warnings);
  }

  return { data, warnings };
}

function resolveRounding(value: unknown): TaxRounding {
  if (value === 'floor' || value === 'round' || value === 'ceil') return value;
  return 'floor';
}

function applyItemDefaults(items: unknown[], warnings: AutofillWarning[]): void {
  items.forEach((item, idx) => {
    if (!isPlainObject(item)) return;
    if (item['taxRate'] === 8 && item['isReducedRate'] === undefined) {
      // 軽減税率 (8%) items are required by 適格請求書 regulation to be flagged.
      // Auto-set the flag instead of forcing every author to remember it.
      item['isReducedRate'] = true;
    }
    if (item['taxRate'] === 8 && item['isReducedRate'] === false) {
      warnings.push({
        path: `items[${idx}].isReducedRate`,
        message: '8% は軽減税率です。isReducedRate=false の指定は無視せず明示的に確認してください。',
      });
    }
  });
}

interface Bucket {
  subtotal: number;
  tax: number;
}

function computeBuckets(items: unknown[], rounding: TaxRounding): Record<TaxRate, Bucket> {
  const buckets: Record<TaxRate, Bucket> = {
    10: { subtotal: 0, tax: 0 },
    8: { subtotal: 0, tax: 0 },
    0: { subtotal: 0, tax: 0 },
  };
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    const qty = toNumber(item['quantity']);
    const price = toNumber(item['unitPrice']);
    const rate = item['taxRate'];
    if (rate !== 0 && rate !== 8 && rate !== 10) continue;
    buckets[rate].subtotal += qty * price;
  }
  for (const rate of [10, 8, 0] as TaxRate[]) {
    buckets[rate].tax = roundTax(buckets[rate].subtotal * (rate / 100), rounding);
  }
  return buckets;
}

function roundTax(raw: number, mode: TaxRounding): number {
  if (mode === 'floor') return Math.floor(raw);
  if (mode === 'ceil') return Math.ceil(raw);
  return Math.round(raw);
}

function diffSummary(
  supplied: Record<string, unknown>,
  computed: { standard: Bucket & { rate: TaxRate }; reduced: Bucket & { rate: TaxRate }; exempt: Bucket & { rate: TaxRate } },
  warnings: AutofillWarning[],
): void {
  for (const key of ['standard', 'reduced', 'exempt'] as const) {
    const provided = supplied[key];
    const calc = computed[key];
    if (!isPlainObject(provided)) continue;
    if (toNumber(provided['subtotal']) !== calc.subtotal) {
      warnings.push({
        path: `taxSummary.${key}.subtotal`,
        message: `指定値 ${toNumber(provided['subtotal'])} と計算値 ${calc.subtotal} が一致しません。items から再計算した値を採用します。`,
      });
    }
    if (toNumber(provided['tax']) !== calc.tax) {
      warnings.push({
        path: `taxSummary.${key}.tax`,
        message: `指定値 ${toNumber(provided['tax'])} と計算値 ${calc.tax} が一致しません。items から再計算した値を採用します。`,
      });
    }
  }
}

function diffTotals(
  supplied: Record<string, unknown>,
  computed: { subtotal: number; tax: number; total: number },
  warnings: AutofillWarning[],
): void {
  for (const key of ['subtotal', 'tax', 'total'] as const) {
    if (toNumber(supplied[key]) !== computed[key]) {
      warnings.push({
        path: `totals.${key}`,
        message: `指定値 ${toNumber(supplied[key])} と計算値 ${computed[key]} が一致しません。items から再計算した値を採用します。`,
      });
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 0;
}
