import type { ValidationError } from '@md-business/core';

/**
 * Translate Ajv validation errors and normalize/autofill warnings into
 * Japanese user-facing messages for db-spec frontmatter.
 *
 * Same shape as schema-spec / schema-invoice / schema-test-spec so the viewer
 * can route all document types through a uniform message channel.
 */

const DB_SPEC_FIELD_LABELS: Record<string, string> = {
  '/schema': 'スキーマバージョン',
  '/documentNumber': '文書番号',
  '/title': 'タイトル',
  '/version': '版',
  '/issueDate': '発行日',
  '/status': 'ステータス',
  '/engine': 'エンジン',
  '/charset': '文字コード',
  '/collation': '照合順序',
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
  '/tables': 'テーブル定義',
  '/tables/N': 'テーブル[N+1]',
  '/tables/N/name': 'テーブル[N+1]の名前',
  '/tables/N/description': 'テーブル[N+1]の説明',
  '/tables/N/columns': 'テーブル[N+1]の列定義',
  '/tables/N/columns/N': 'テーブル[N+1]の列[N+1]',
  '/tables/N/columns/N/name': 'テーブル[N+1]の列[N+1]の名前',
  '/tables/N/columns/N/type': 'テーブル[N+1]の列[N+1]の型',
  '/tables/N/columns/N/pk': 'テーブル[N+1]の列[N+1]の主キー指定',
  '/tables/N/columns/N/nullable': 'テーブル[N+1]の列[N+1]の NULL 許可',
  '/tables/N/columns/N/unique': 'テーブル[N+1]の列[N+1]の一意制約',
  '/tables/N/columns/N/default': 'テーブル[N+1]の列[N+1]の既定値',
  '/tables/N/columns/N/fk': 'テーブル[N+1]の列[N+1]の外部キー',
  '/tables/N/columns/N/fk/table': 'テーブル[N+1]の列[N+1]の外部キー参照先テーブル',
  '/tables/N/columns/N/fk/column': 'テーブル[N+1]の列[N+1]の外部キー参照先列',
  '/tables/N/columns/N/fk/onDelete': 'テーブル[N+1]の列[N+1]の外部キー削除時動作',
  '/tables/N/columns/N/fk/onUpdate': 'テーブル[N+1]の列[N+1]の外部キー更新時動作',
  '/tables/N/indexes': 'テーブル[N+1]のインデックス',
  '/tables/N/indexes/N': 'テーブル[N+1]のインデックス[N+1]',
  '/tables/N/indexes/N/name': 'テーブル[N+1]のインデックス[N+1]の名前',
  '/tables/N/indexes/N/columns': 'テーブル[N+1]のインデックス[N+1]の対象列',
  '/tables/N/indexes/N/columns/N': 'テーブル[N+1]のインデックス[N+1]の対象列[N+1]',
  '/tables/N/indexes/N/unique': 'テーブル[N+1]のインデックス[N+1]の一意指定',
  '/tables/N/indexes/N/using': 'テーブル[N+1]のインデックス[N+1]の方式',
  '/tables/N/triggers': 'テーブル[N+1]のトリガー',
  '/tables/N/triggers/N': 'テーブル[N+1]のトリガー[N+1]',
  '/tables/N/triggers/N/name': 'テーブル[N+1]のトリガー[N+1]の名前',
  '/tables/N/triggers/N/on': 'テーブル[N+1]のトリガー[N+1]の契機',
  '/tables/N/triggers/N/action': 'テーブル[N+1]のトリガー[N+1]の処理',
  '/migrations': 'マイグレーション',
  '/migrations/N': 'マイグレーション[N+1]',
  '/migrations/N/id': 'マイグレーション[N+1]の ID',
  '/migrations/N/description': 'マイグレーション[N+1]の説明',
  '/theme': 'テーマ',
  '/fileName': 'ファイル名テンプレート',
};

const PATTERN_HINTS: Record<string, string> = {
  '/version': 'SemVer 形式（例: 0.1.0、1.2.3）で入力してください',
};

const FORMAT_HINTS: Record<string, string> = {
  '/issueDate': 'YYYY-MM-DD 形式の日付（例: 2026-06-26）で入力してください',
};

const ALLOWED_VALUES: Record<string, string> = {
  '/status':
    'draft / review / approved / deprecated（または ドラフト / レビュー中 / 承認済 / 廃止）',
  '/engine':
    'postgres / mysql / aurora / sqlite / neon / supabase / turso / cloudsql',
  '/tables/N/columns/N/fk/onDelete': 'cascade / restrict / set_null / no_action',
  '/tables/N/columns/N/fk/onUpdate': 'cascade / restrict / set_null / no_action',
  '/tables/N/indexes/N/using': 'btree / gin / gist / hash / brin',
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
  const normalizedParts: string[] = [];
  for (const p of parts) {
    if (/^\d+$/.test(p)) {
      indices.push(Number(p));
      normalizedParts.push('N');
      continue;
    }
    normalizedParts.push(p);
  }
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
  const template = DB_SPEC_FIELD_LABELS[normalized];
  if (template) return applyIndices(template, indices);
  return path.replace(/^\//, '');
}

function hintFor(table: Record<string, string>, path: string): string | undefined {
  const { normalized } = normalizePath(path);
  return table[normalized];
}

export function translateDbSpecError(err: ValidationError): string {
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

export function translateDbSpecErrors(errors: ValidationError[]): string[] {
  return errors.map(translateDbSpecError);
}

export function translateDbSpecWarning(warning: {
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

export function translateDbSpecWarnings(
  warnings: Array<{ path: string; message: string }>,
): string[] {
  return warnings.map(translateDbSpecWarning);
}
