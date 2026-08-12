import type { ValidationError } from '@md-business/core';

/**
 * Translate Ajv validation errors and normalize/autofill warnings into
 * Japanese user-facing messages for investigation frontmatter.
 *
 * Same shape as the other document types so the viewer can route them all
 * through a uniform message channel.
 */

const INVESTIGATION_FIELD_LABELS: Record<string, string> = {
  '/schema': 'スキーマ',
  '/kind': '種別',
  '/documentNumber': '文書番号',
  '/title': 'タイトル',
  '/createdAt': '作成日時',
  '/status': '状態',
  '/authors': '作成者',
  '/authors/N': '作成者[N+1]',
  '/authors/N/name': '作成者[N+1]の名前',
  '/authors/N/role': '作成者[N+1]の役割',
  '/reviewers': 'レビュアー',
  '/reviewers/N': 'レビュアー[N+1]',
  '/reviewers/N/name': 'レビュアー[N+1]の名前',
  '/reviewers/N/role': 'レビュアー[N+1]の役割',
  '/targets': '対象ファイル',
  '/targets/N': '対象ファイル[N+1]',
  '/targets/N/path': '対象ファイル[N+1]のパス',
  '/targets/N/sha256': '対象ファイル[N+1]のハッシュ(SHA-256)',
  '/targets/N/note': '対象ファイル[N+1]の備考',
  '/tools': '使用ツール',
  '/tools/N': '使用ツール[N+1]',
  '/tools/N/name': '使用ツール[N+1]の名前',
  '/tools/N/version': '使用ツール[N+1]の版',
  '/window': '調査時間帯',
  '/window/from': '調査時間帯の開始',
  '/window/to': '調査時間帯の終了',
  '/findings': '所見',
  '/findings/N': '所見[N+1]',
  '/findings/N/id': '所見[N+1]の番号',
  '/findings/N/summary': '所見[N+1]の要約',
  '/findings/N/severity': '所見[N+1]の深刻度',
  '/findings/N/evidence': '所見[N+1]の根拠',
  '/findings/N/evidence/N': '所見[N+1]の根拠[N+1]',
  '/summary': '要約',
  '/relatedDocs': '関連文書',
  '/relatedDocs/N': '関連文書[N+1]',
  '/theme': 'テーマ',
  '/fileName': 'ファイル名テンプレート',
};

const PATTERN_HINTS: Record<string, string> = {
  '/targets/N/sha256': '小文字 16 進 64 桁の SHA-256 を指定してください',
  '/findings/N/id': '所見番号は `F-01` の形式で指定してください',
  '/findings/N/evidence/N':
    'save_evidence が返す参照（例: evidence/EV-001.md）を指定してください。根拠のない所見は書けません',
};

const FORMAT_HINTS: Record<string, string> = {
  '/createdAt': 'ISO 8601 形式の日時（例: 2026-08-12T09:30:00+09:00）で入力してください',
  '/window/from': 'ISO 8601 形式の日時（例: 2026-08-12T09:30:00+09:00）で入力してください',
  '/window/to': 'ISO 8601 形式の日時（例: 2026-08-12T09:30:00+09:00）で入力してください',
};

const ALLOWED_VALUES: Record<string, string> = {
  '/kind': 'log / network（または ログ / ネットワーク）',
  '/status': 'investigating / concluded / suspended（または 調査中 / 完了 / 保留）',
  '/findings/N/severity': 'high / medium / low / info（または 高 / 中 / 低 / 情報）',
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
  const template = INVESTIGATION_FIELD_LABELS[normalized];
  if (template) return applyIndices(template, indices);
  return path.replace(/^\//, '');
}

function hintFor(table: Record<string, string>, path: string): string | undefined {
  const { normalized } = normalizePath(path);
  return table[normalized];
}

export function translateInvestigationError(err: ValidationError): string {
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

export function translateInvestigationErrors(errors: ValidationError[]): string[] {
  return errors.map(translateInvestigationError);
}

export function translateInvestigationWarning(warning: {
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

export function translateInvestigationWarnings(
  warnings: Array<{ path: string; message: string }>,
): string[] {
  return warnings.map(translateInvestigationWarning);
}
