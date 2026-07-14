import type { ValidationError } from '@md-business/core';

/**
 * Translate Ajv validation errors and normalize/autofill warnings into
 * Japanese user-facing messages for nosql-db-spec frontmatter.
 *
 * Same shape as schema-db-spec / schema-test-spec so the viewer can route
 * all document types through a uniform message channel. One nosql-specific
 * addition: `shape` maps use user-chosen field names as keys, so paths like
 * `/collections/0/shape/表示名/type` normalize the dynamic segment to `X`
 * and the label template re-injects the actual field name.
 */

const NOSQL_DB_SPEC_FIELD_LABELS: Record<string, string> = {
  '/schema': 'スキーマバージョン',
  '/documentNumber': '文書番号',
  '/title': 'タイトル',
  '/version': '版',
  '/issueDate': '発行日',
  '/status': 'ステータス',
  '/engine': 'エンジン',
  '/multiRegion': 'マルチリージョン',
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
  '/collections': 'コレクション定義',
  '/collections/N': 'コレクション[N+1]',
  '/collections/N/path': 'コレクション[N+1]のパス',
  '/collections/N/description': 'コレクション[N+1]の説明',
  '/collections/N/docIdStrategy': 'コレクション[N+1]のドキュメントID戦略',
  '/collections/N/partitionKeyField': 'コレクション[N+1]のパーティションキー',
  '/collections/N/sortKeyField': 'コレクション[N+1]のソートキー',
  '/collections/N/shape': 'コレクション[N+1]の形状',
  '/collections/N/shape/X': 'コレクション[N+1]のフィールド「X」',
  '/collections/N/shape/X/type': 'コレクション[N+1]のフィールド「X」の型',
  '/collections/N/shape/X/required': 'コレクション[N+1]のフィールド「X」の必須指定',
  '/collections/N/shape/X/default': 'コレクション[N+1]のフィールド「X」の既定値',
  '/collections/N/shape/X/enum': 'コレクション[N+1]のフィールド「X」の選択肢',
  '/collections/N/shape/X/enum/N': 'コレクション[N+1]のフィールド「X」の選択肢[N+1]',
  '/collections/N/shape/X/description': 'コレクション[N+1]のフィールド「X」の説明',
  '/collections/N/shape/X/of': 'コレクション[N+1]のフィールド「X」の要素定義',
  '/collections/N/shape/X/of/type': 'コレクション[N+1]のフィールド「X」の要素の型',
  '/collections/N/shape/X/shape': 'コレクション[N+1]のフィールド「X」の入れ子形状',
  '/collections/N/shape/X/shape/X': 'コレクション[N+1]のフィールド「X」の入れ子フィールド「X」',
  '/collections/N/shape/X/shape/X/type': 'コレクション[N+1]のフィールド「X」の入れ子フィールド「X」の型',
  '/collections/N/indexes': 'コレクション[N+1]のインデックス',
  '/collections/N/indexes/N': 'コレクション[N+1]のインデックス[N+1]',
  '/collections/N/indexes/N/fields': 'コレクション[N+1]のインデックス[N+1]の対象フィールド',
  '/collections/N/indexes/N/fields/N': 'コレクション[N+1]のインデックス[N+1]の対象フィールド[N+1]',
  '/collections/N/indexes/N/scope': 'コレクション[N+1]のインデックス[N+1]のスコープ',
  '/collections/N/indexes/N/mode': 'コレクション[N+1]のインデックス[N+1]のモード',
  '/collections/N/ttl': 'コレクション[N+1]の TTL',
  '/collections/N/ttl/field': 'コレクション[N+1]の TTL 対象フィールド',
  '/collections/N/ttl/enabled': 'コレクション[N+1]の TTL 有効フラグ',
  '/collections/N/engineSpecific': 'コレクション[N+1]のエンジン固有設定',
  '/securityRules': 'セキュリティルール',
  '/securityRules/N': 'セキュリティルール[N+1]',
  '/securityRules/N/match': 'セキュリティルール[N+1]の対象パス',
  '/securityRules/N/allow': 'セキュリティルール[N+1]の許可操作',
  '/securityRules/N/allow/N': 'セキュリティルール[N+1]の許可操作[N+1]',
  '/securityRules/N/if': 'セキュリティルール[N+1]の条件',
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
    'firestore / dynamodb / mongodb / cosmosdb / redis / documentdb / turso-document',
  '/collections/N/docIdStrategy':
    'uuid / auto / auth-uid / composite（または UUID / 自動 / 認証UID / 複合）',
  '/collections/N/shape/X/type':
    'string / number / boolean / timestamp / map / array / reference / geopoint / bytes / null',
  '/collections/N/shape/X/of/type':
    'string / number / boolean / timestamp / map / array / reference / geopoint / bytes / null',
  '/collections/N/shape/X/shape/X/type':
    'string / number / boolean / timestamp / map / array / reference / geopoint / bytes / null',
  '/collections/N/indexes/N/scope': 'collection / collection-group',
  '/collections/N/indexes/N/mode': 'ASCENDING / DESCENDING',
  '/securityRules/N/allow/N': 'read / write / get / list / create / update / delete',
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
  names: string[];
}

function normalizePath(path: string): NormalizedPath {
  if (!path || path === '/') return { normalized: '/', indices: [], names: [] };
  const indices: number[] = [];
  const names: string[] = [];
  const parts = path.split('/').filter(Boolean);
  const normalizedParts: string[] = [];
  for (const p of parts) {
    // A segment directly under `shape` is a user field name, not a schema key.
    if (normalizedParts[normalizedParts.length - 1] === 'shape') {
      names.push(p);
      normalizedParts.push('X');
      continue;
    }
    if (/^\d+$/.test(p)) {
      indices.push(Number(p));
      normalizedParts.push('N');
      continue;
    }
    normalizedParts.push(p);
  }
  return { normalized: '/' + normalizedParts.join('/'), indices, names };
}

function applyPlaceholders(
  template: string,
  indices: number[],
  names: string[],
): string {
  let i = 0;
  let n = 0;
  return template
    .replace(/N\+1/g, () => {
      const idx = indices[i++];
      return idx === undefined ? '?' : String(idx + 1);
    })
    .replace(/X/g, () => names[n++] ?? '?');
}

function labelFor(path: string): string {
  if (!path || path === '/') return 'ドキュメント全体';
  const { normalized, indices, names } = normalizePath(path);
  const template = NOSQL_DB_SPEC_FIELD_LABELS[normalized];
  if (template) return applyPlaceholders(template, indices, names);
  return path.replace(/^\//, '');
}

function hintFor(table: Record<string, string>, path: string): string | undefined {
  const { normalized } = normalizePath(path);
  return table[normalized];
}

export function translateNosqlDbSpecError(err: ValidationError): string {
  const { keyword, path, message } = err;
  let effectivePath = path;

  if (keyword === 'required') {
    const match = /must have required property ['"]([^'"]+)['"]/.exec(message);
    const missingProp = match?.[1];
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
    case 'minProperties':
      return `${label}には 1 つ以上のフィールド定義が必要です`;
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

export function translateNosqlDbSpecErrors(errors: ValidationError[]): string[] {
  return errors.map(translateNosqlDbSpecError);
}

export function translateNosqlDbSpecWarning(warning: {
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

export function translateNosqlDbSpecWarnings(
  warnings: Array<{ path: string; message: string }>,
): string[] {
  return warnings.map(translateNosqlDbSpecWarning);
}
