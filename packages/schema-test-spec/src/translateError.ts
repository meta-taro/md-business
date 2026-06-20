import type { ValidationError } from '@md-business/core';

/**
 * Translate Ajv validation errors and normalize/autofill warnings into
 * Japanese user-facing messages for test-spec frontmatter.
 *
 * Same shape as schema-spec / schema-invoice so the viewer can route both
 * document types through a uniform message channel.
 */

const TEST_SPEC_FIELD_LABELS: Record<string, string> = {
  '/schema': 'スキーマバージョン',
  '/documentNumber': '文書番号',
  '/title': 'タイトル',
  '/version': '版',
  '/issueDate': '発行日',
  '/status': 'ステータス',
  '/authors': '作成者',
  '/authors/N': '作成者[N+1]',
  '/authors/N/name': '作成者[N+1]の名前',
  '/authors/N/role': '作成者[N+1]の役割',
  '/reviewers': 'レビュアー',
  '/reviewers/N': 'レビュアー[N+1]',
  '/reviewers/N/name': 'レビュアー[N+1]の名前',
  '/reviewers/N/role': 'レビュアー[N+1]の役割',
  '/relatedDocs': '関連文書',
  '/relatedDocs/N': '関連文書[N+1]',
  '/googleSheetId': 'シート ID（Google Sheets）',
  '/columns': '列定義',
  '/columns/N': '列[N+1]',
  '/columns/N/name': '列[N+1]の名前',
  '/columns/N/type': '列[N+1]の型',
  '/columns/N/values': '列[N+1]の選択肢',
  '/columns/N/values/N': '列[N+1]の選択肢[N+1]',
  '/columns/N/visual': '列[N+1]の書式',
  '/columns/N/visual/X': '列[N+1]の書式 ({X})',
  '/columns/N/visual/X/row_background': '列[N+1]の書式 ({X}) 行背景色',
  '/columns/N/visual/X/background': '列[N+1]の書式 ({X}) 背景色',
  '/columns/N/visual/X/color': '列[N+1]の書式 ({X}) 文字色',
  '/columns/N/min': '列[N+1]の最小値',
  '/columns/N/max': '列[N+1]の最大値',
  '/theme': 'テーマ',
  '/fileName': 'ファイル名テンプレート',
};

const PATTERN_HINTS: Record<string, string> = {
  '/version': 'SemVer 形式（例: 0.1.0、1.2.3）で入力してください',
  '/columns/N/visual/X/row_background':
    '行背景色は hex 形式（例: #e6f4ea）で入力してください',
  '/columns/N/visual/X/background': '背景色は hex 形式（例: #fce8e6）で入力してください',
  '/columns/N/visual/X/color': '文字色は hex 形式（例: #137333）で入力してください',
};

const FORMAT_HINTS: Record<string, string> = {
  '/issueDate': 'YYYY-MM-DD 形式の日付（例: 2026-06-18）で入力してください',
};

const ALLOWED_VALUES: Record<string, string> = {
  '/status':
    'draft / review / executing / completed（または ドラフト / レビュー中 / 実施中 / 完了）',
  '/columns/N/type': 'text / multiline_text / enum / date / number / checkbox / url',
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
  /** Non-numeric path segments that came after a `visual/` segment. These get
   *  surfaced into the label via the `X` placeholder, so authors can tell
   *  which enum value's style is broken. */
  visualKeys: string[];
}

function normalizePath(path: string): NormalizedPath {
  if (!path || path === '/') return { normalized: '/', indices: [], visualKeys: [] };
  const indices: number[] = [];
  const visualKeys: string[] = [];
  const parts = path.split('/').filter(Boolean);
  const normalizedParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (/^\d+$/.test(p)) {
      indices.push(Number(p));
      normalizedParts.push('N');
      continue;
    }
    // Capture visual-style sub-keys (the enum value, e.g. "OK" / "NG" / "保留")
    // as X placeholders so the label can show which style is broken without
    // exploding the label table.
    if (i >= 1 && parts[i - 1] === 'visual') {
      visualKeys.push(p);
      normalizedParts.push('X');
      continue;
    }
    normalizedParts.push(p);
  }
  return { normalized: '/' + normalizedParts.join('/'), indices, visualKeys };
}

function applyIndices(template: string, indices: number[], visualKeys: string[]): string {
  let i = 0;
  let j = 0;
  return template
    .replace(/N\+1/g, () => {
      const idx = indices[i++];
      return idx === undefined ? '?' : String(idx + 1);
    })
    .replace(/\{X\}/g, () => {
      const key = visualKeys[j++];
      return key === undefined ? '?' : key;
    });
}

function labelFor(path: string): string {
  if (!path || path === '/') return 'ドキュメント全体';
  const { normalized, indices, visualKeys } = normalizePath(path);
  const template = TEST_SPEC_FIELD_LABELS[normalized];
  if (template) return applyIndices(template, indices, visualKeys);
  return path.replace(/^\//, '');
}

function hintFor(table: Record<string, string>, path: string): string | undefined {
  const { normalized } = normalizePath(path);
  return table[normalized];
}

export function translateTestSpecError(err: ValidationError): string {
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
    case 'minItems':
      return `${label}は 1 件以上必要です`;
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
    case 'additionalProperties': {
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

export function translateTestSpecErrors(errors: ValidationError[]): string[] {
  return errors.map(translateTestSpecError);
}

export function translateTestSpecWarning(warning: {
  path: string;
  message: string;
}): string {
  const label = labelFor(
    '/' + warning.path.replace(/^\//, '').replace(/\[(\d+)\]/g, '/$1').replace(/\./g, '/'),
  );
  const msg = warning.message;
  if (msg.startsWith('Multiple input keys mapped to')) {
    return `${label} に複数の入力キーが指定されています。キーをひとつに統一してください。`;
  }
  return `${label}: ${msg}`;
}

export function translateTestSpecWarnings(
  warnings: Array<{ path: string; message: string }>,
): string[] {
  return warnings.map(translateTestSpecWarning);
}
