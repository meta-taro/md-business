import type { ValidationError } from '@md-business/core';

/**
 * Translate Ajv validation errors and normalize/autofill warnings into
 * Japanese user-facing messages.
 *
 * Why: Ajv emits English schema-speak ("must have required property 'name'")
 * that is not actionable for invoice authors. This module maps each
 * (path + keyword) pair to a friendly Japanese label so the viewer can show
 * e.g. "請求先の名前は必須項目です" instead of "/recipient: must have
 * required property 'name'".
 *
 * Pure functions — no DOM, no globals.
 */

// Path → Japanese label. Array element paths use `N` as the index placeholder;
// the index is substituted as `N+1` at lookup time (1-origin display).
const INVOICE_FIELD_LABELS: Record<string, string> = {
  '/schemaVersion': 'スキーマバージョン',
  '/invoiceNumber': '請求書番号',
  '/issueDate': '発行日',
  '/dueDate': '支払期限',
  '/issuer': '発行元',
  '/issuer/name': '発行元の名前',
  '/issuer/registrationNumber': '発行元の登録番号',
  '/issuer/postalCode': '発行元の郵便番号',
  '/issuer/address': '発行元の住所',
  '/issuer/tel': '発行元の電話番号',
  '/issuer/email': '発行元のメールアドレス',
  '/recipient': '請求先',
  '/recipient/name': '請求先の名前',
  '/recipient/honorific': '請求先の敬称',
  '/recipient/postalCode': '請求先の郵便番号',
  '/recipient/address': '請求先の住所',
  '/items': '品目',
  '/items/N': '品目[N+1]',
  '/items/N/name': '品目[N+1]の品名',
  '/items/N/quantity': '品目[N+1]の数量',
  '/items/N/unit': '品目[N+1]の単位',
  '/items/N/unitPrice': '品目[N+1]の単価',
  '/items/N/taxRate': '品目[N+1]の税率',
  '/items/N/isReducedRate': '品目[N+1]の軽減税率フラグ',
  '/items/N/note': '品目[N+1]の備考',
  '/taxSummary': '税率別合計',
  '/taxSummary/standard': '税率別合計（10%）',
  '/taxSummary/standard/rate': '税率別合計（10%）の税率',
  '/taxSummary/standard/subtotal': '税率別合計（10%）の小計',
  '/taxSummary/standard/tax': '税率別合計（10%）の消費税',
  '/taxSummary/reduced': '税率別合計（8%）',
  '/taxSummary/reduced/rate': '税率別合計（8%）の税率',
  '/taxSummary/reduced/subtotal': '税率別合計（8%）の小計',
  '/taxSummary/reduced/tax': '税率別合計（8%）の消費税',
  '/taxSummary/exempt': '税率別合計（0%）',
  '/taxSummary/exempt/rate': '税率別合計（0%）の税率',
  '/taxSummary/exempt/subtotal': '税率別合計（0%）の小計',
  '/taxSummary/exempt/tax': '税率別合計（0%）の消費税',
  '/totals': '合計',
  '/totals/subtotal': '小計',
  '/totals/tax': '消費税',
  '/totals/total': '税込合計',
  '/paymentInfo': '振込先',
  '/paymentInfo/bankName': '振込先の銀行名',
  '/paymentInfo/branchName': '振込先の支店名',
  '/paymentInfo/accountType': '振込先の口座種別',
  '/paymentInfo/accountNumber': '振込先の口座番号',
  '/paymentInfo/accountHolder': '振込先の名義',
  '/notes': '備考',
  '/fileName': 'ファイル名テンプレート',
  '/stamp': '印影',
  '/stamp/enabled': '印影の表示有無',
  '/stamp/shape': '印影の形',
  '/stamp/text': '印影の文字',
  '/stamp/font': '印影のフォント',
};

// Pattern-specific Japanese hints for known regex constraints in the schema.
const PATTERN_HINTS: Record<string, string> = {
  '/issuer/registrationNumber': 'T で始まる 13 桁の数字（例: T1234567890123）で入力してください',
  '/issuer/postalCode': '郵便番号は 7 桁（例: 123-4567）で入力してください',
  '/recipient/postalCode': '郵便番号は 7 桁（例: 123-4567）で入力してください',
};

const FORMAT_HINTS: Record<string, string> = {
  '/issueDate': 'YYYY-MM-DD 形式の日付（例: 2026-06-30）で入力してください',
  '/dueDate': 'YYYY-MM-DD 形式の日付（例: 2026-07-31）で入力してください',
  '/issuer/email': 'メールアドレスの形式が不正です',
};

// Enum constraints — surface the allowed values to make the message actionable.
const ALLOWED_VALUES: Record<string, string> = {
  '/items/N/taxRate': '10 / 8 / 0',
  '/taxSummary/standard/rate': '10',
  '/taxSummary/reduced/rate': '8',
  '/taxSummary/exempt/rate': '0',
  '/paymentInfo/accountType': '普通 / 当座 / 貯蓄',
  '/stamp/shape': 'auto / round / square / off',
};

const TYPE_LABELS: Record<string, string> = {
  string: '文字列',
  number: '数値',
  integer: '整数',
  boolean: '真偽値（true/false）',
  object: 'オブジェクト',
  array: '配列',
};

interface NormalizedPath {
  normalized: string;
  indices: number[];
}

function normalizePath(path: string): NormalizedPath {
  if (!path || path === '/') return { normalized: '/', indices: [] };
  const indices: number[] = [];
  const parts = path.split('/').filter(Boolean);
  const normalizedParts = parts.map((p) => {
    if (/^\d+$/.test(p)) {
      indices.push(Number(p));
      return 'N';
    }
    return p;
  });
  return { normalized: '/' + normalizedParts.join('/'), indices };
}

function applyIndices(template: string, indices: number[]): string {
  let i = 0;
  return template.replace(/N\+1/g, () => {
    const idx = indices[i++];
    return idx === undefined ? '?' : String(idx + 1);
  });
}

function labelFor(path: string): string {
  if (!path || path === '/') return 'ドキュメント全体';
  const { normalized, indices } = normalizePath(path);
  const template = INVOICE_FIELD_LABELS[normalized];
  if (template) return applyIndices(template, indices);
  // Unknown path — fall back to the original instancePath so the user can at
  // least find the field. Drops the leading slash for readability.
  return path.replace(/^\//, '');
}

function hintFor(table: Record<string, string>, path: string): string | undefined {
  const { normalized } = normalizePath(path);
  return table[normalized];
}

/**
 * Translate a single Ajv validation error to a Japanese, user-facing message.
 *
 * The `required` keyword is special-cased: Ajv reports it on the *parent*
 * instancePath with the missing property name buried in the message string.
 * We re-target the label to the child path (`/recipient` + `name` →
 * `/recipient/name`) so the message reads "請求先の名前は必須項目です"
 * rather than "請求先は必須項目です".
 */
export function translateInvoiceError(err: ValidationError): string {
  const { keyword, path, message } = err;
  let effectivePath = path;
  let missingProp: string | undefined;

  if (keyword === 'required') {
    const match = /must have required property ['"]([^'"]+)['"]/.exec(message);
    missingProp = match?.[1];
    if (missingProp) {
      effectivePath = path === '/' ? `/${missingProp}` : `${path}/${missingProp}`;
    }
  }

  const label = labelFor(effectivePath);

  switch (keyword) {
    case 'required':
      return `${label}は必須項目です`;
    case 'minLength':
      return `${label}は空にできません`;
    case 'minimum':
      return `${label}は 0 以上の数値である必要があります`;
    case 'type': {
      const typeMatch = /must be (\w+)/.exec(message)?.[1];
      const tLabel = TYPE_LABELS[typeMatch ?? ''] ?? typeMatch ?? '正しい型';
      return `${label}は${tLabel}である必要があります`;
    }
    case 'enum': {
      const allowed = hintFor(ALLOWED_VALUES, effectivePath);
      return allowed
        ? `${label}は ${allowed} のいずれかである必要があります`
        : `${label}に許可されていない値が指定されています`;
    }
    case 'pattern': {
      const hint = hintFor(PATTERN_HINTS, effectivePath);
      return hint ? `${label}: ${hint}` : `${label}の形式が不正です`;
    }
    case 'format': {
      const hint = hintFor(FORMAT_HINTS, effectivePath);
      return hint ? `${label}: ${hint}` : `${label}の形式が不正です`;
    }
    case 'minItems':
      return `${label}は 1 件以上必要です`;
    case 'additionalProperties': {
      // Ajv 2020 puts the offending key in the message body, e.g.
      // "must NOT have additional properties". Surface what we can.
      const propMatch = /'([^']+)'/.exec(message);
      const prop = propMatch?.[1];
      const parent = labelFor(path);
      return prop
        ? `${parent} に未知のキー「${prop}」が含まれています`
        : `${parent} に未知のキーが含まれています`;
    }
    case 'const':
      return `${label}の値が固定値と一致しません`;
    default:
      return `${label}: ${message}`;
  }
}

export function translateInvoiceErrors(errors: ValidationError[]): string[] {
  return errors.map(translateInvoiceError);
}

/**
 * Translate a normalize/autofill warning (path + message) to a Japanese
 * sentence. Autofill warnings are already in Japanese; normalize warnings
 * are in English and get a friendlier rewrite.
 */
export function translateInvoiceWarning(warning: { path: string; message: string }): string {
  const label = labelFor('/' + warning.path.replace(/^\//, '').replace(/\[(\d+)\]/g, '/$1').replace(/\./g, '/'));
  const msg = warning.message;
  if (msg.startsWith('Multiple input keys mapped to')) {
    return `${label} に複数の入力キーが指定されています。キーをひとつに統一してください。`;
  }
  // Autofill warnings already carry Japanese sentences — pass through.
  return `${label}: ${msg}`;
}

export function translateInvoiceWarnings(
  warnings: Array<{ path: string; message: string }>,
): string[] {
  return warnings.map(translateInvoiceWarning);
}
