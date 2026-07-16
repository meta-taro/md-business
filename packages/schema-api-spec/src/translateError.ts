import type { ValidationError } from '@md-business/core';

/**
 * Translate Ajv validation errors and normalize/autofill warnings into
 * Japanese user-facing messages for api-spec frontmatter.
 *
 * Same shape as schema-spec / schema-invoice / schema-test-spec / schema-db-spec
 * so the viewer can route all document types through a uniform message channel.
 *
 * Unlike db-spec's flat label table, api-spec composes labels segment-by-segment:
 * the `field` shape recurs across path params, query params, headers, request
 * bodies, response bodies, and arbitrarily deep `of` nesting, so a compositional
 * labeler scales where an enumerated table cannot.
 */

const SEGMENT_LABELS: Record<string, string> = {
  schema: 'スキーマバージョン',
  documentNumber: '文書番号',
  title: 'タイトル',
  version: '版',
  issueDate: '発行日',
  status: 'ステータス',
  protocol: 'プロトコル',
  auth: '認証方式',
  baseUrl: 'ベースURL',
  authors: '作成者',
  reviewers: 'レビュアー',
  relatedDocs: '関連文書',
  endpoints: 'エンドポイント',
  errors: 'エラー',
  theme: 'テーマ',
  fileName: 'ファイル名テンプレート',
  name: '名前',
  role: '役割',
  operationId: 'オペレーションID',
  method: 'メソッド',
  path: 'パス',
  summary: '概要',
  tags: 'タグ',
  deprecated: '非推奨指定',
  request: 'リクエスト',
  responses: 'レスポンス',
  pathParams: 'パスパラメータ',
  queryParams: 'クエリパラメータ',
  headers: 'ヘッダ',
  body: 'ボディ',
  contentType: 'コンテンツタイプ',
  fields: 'フィールド',
  of: '要素',
  type: '型',
  required: '必須指定',
  description: '説明',
  dbRef: 'DB参照',
  format: 'フォーマット',
  errorRef: 'エラー参照',
  code: 'コード',
  httpStatus: 'HTTPステータス',
  message: 'メッセージ',
};

const PATTERN_HINTS: Record<string, string> = {
  version: 'SemVer 形式（例: 0.1.0、1.2.3）で入力してください',
  dbRef: '「<文書番号>#<テーブル>.<列>」形式（例: DB-2026-001#users.id）で入力してください',
};

const FORMAT_HINTS: Record<string, string> = {
  issueDate: 'YYYY-MM-DD 形式の日付（例: 2026-07-15）で入力してください',
};

const ENUM_HINTS: Record<string, string> = {
  status: 'draft / review / approved / deprecated（または ドラフト / レビュー中 / 承認済 / 廃止）',
  protocol: 'rest / rpc / graphql',
  auth: 'none / bearer / apiKey / oauth2 / basic',
  method: 'GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS',
  type: 'string / integer / number / boolean / array / object / date / datetime',
};

const TYPE_LABELS: Record<string, string> = {
  string: '文字列',
  number: '数値',
  integer: '整数',
  boolean: '真偽値（true/false）',
  object: 'オブジェクト',
  array: '配列',
};

/**
 * Compose a Japanese label for a JSON Pointer path by walking its segments.
 * Numeric segments render as `[n+1]` suffixes; named segments join with `の`.
 */
function labelFor(path: string): string {
  if (!path || path === '/') return 'ドキュメント全体';
  const parts = path.split('/').filter(Boolean);
  let label = '';
  for (const p of parts) {
    if (/^\d+$/.test(p)) {
      label += `[${Number(p) + 1}]`;
      continue;
    }
    const seg = SEGMENT_LABELS[p] ?? p;
    label = label ? `${label}の${seg}` : seg;
  }
  return label;
}

/** Last named (non-numeric) segment of a path, used to key hint tables. */
function lastNamedSegment(path: string): string | undefined {
  const parts = path.split('/').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    if (!/^\d+$/.test(p)) return p;
  }
  return undefined;
}

function hintFor(table: Record<string, string>, path: string): string | undefined {
  const seg = lastNamedSegment(path);
  return seg ? table[seg] : undefined;
}

export function translateApiSpecError(err: ValidationError): string {
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
    case 'minimum':
    case 'maximum':
      return `${label}は範囲外の値です（HTTP ステータスコードは 100〜599）`;
    case 'enum': {
      const allowed = hintFor(ENUM_HINTS, effectivePath);
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

export function translateApiSpecErrors(errors: ValidationError[]): string[] {
  return errors.map(translateApiSpecError);
}

export function translateApiSpecWarning(warning: { path: string; message: string }): string {
  const label = labelFor(
    '/' + warning.path.replace(/^\//, '').replace(/\[(\d+)\]/g, '/$1').replace(/\./g, '/'),
  );
  const msg = warning.message;
  if (msg.startsWith('Multiple input keys mapped to')) {
    return `${label} に複数の入力キーが指定されています。キーをひとつに統一してください。`;
  }
  return `${label}: ${msg}`;
}

export function translateApiSpecWarnings(
  warnings: Array<{ path: string; message: string }>,
): string[] {
  return warnings.map(translateApiSpecWarning);
}
