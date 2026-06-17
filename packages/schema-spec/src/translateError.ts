import type { ValidationError } from '@md-business/core';

/**
 * Translate Ajv validation errors and normalize/autofill warnings into
 * Japanese user-facing messages for spec frontmatter.
 *
 * Same shape as schema-invoice/translateError so the viewer can route both
 * document types through a uniform message channel.
 */

const SPEC_FIELD_LABELS: Record<string, string> = {
  '/schemaVersion': 'スキーマバージョン',
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
  '/chapters': '章ファイル',
  '/chapters/N': '章ファイル[N+1]',
  '/toc': '目次',
  '/theme': 'テーマ',
  '/fileName': 'ファイル名テンプレート',
};

const PATTERN_HINTS: Record<string, string> = {
  '/version': 'SemVer 形式（例: 0.1.0、1.2.3）で入力してください',
  '/chapters/N': '章ファイルは `.md` で終わるパスを指定してください',
};

const FORMAT_HINTS: Record<string, string> = {
  '/issueDate': 'YYYY-MM-DD 形式の日付（例: 2026-06-17）で入力してください',
};

const ALLOWED_VALUES: Record<string, string> = {
  '/status': 'draft / review / approved（または ドラフト / レビュー中 / 承認済）',
  '/toc': 'auto / manual（または 自動 / 手動）',
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
  const template = SPEC_FIELD_LABELS[normalized];
  if (template) return applyIndices(template, indices);
  return path.replace(/^\//, '');
}

function hintFor(table: Record<string, string>, path: string): string | undefined {
  const { normalized } = normalizePath(path);
  return table[normalized];
}

export function translateSpecError(err: ValidationError): string {
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

export function translateSpecErrors(errors: ValidationError[]): string[] {
  return errors.map(translateSpecError);
}

export function translateSpecWarning(warning: { path: string; message: string }): string {
  const label = labelFor(
    '/' + warning.path.replace(/^\//, '').replace(/\[(\d+)\]/g, '/$1').replace(/\./g, '/'),
  );
  const msg = warning.message;
  if (msg.startsWith('Multiple input keys mapped to')) {
    return `${label} に複数の入力キーが指定されています。キーをひとつに統一してください。`;
  }
  return `${label}: ${msg}`;
}

export function translateSpecWarnings(
  warnings: Array<{ path: string; message: string }>,
): string[] {
  return warnings.map(translateSpecWarning);
}
