/**
 * Japanese → English key dictionary for api-spec (API 詳細設計書) frontmatter.
 *
 * Authors write Markdown frontmatter in Japanese, and {@link normalizeApiSpecFrontmatter}
 * maps keys to the canonical English shape that {@link apiSpecSchema} validates.
 *
 * Note: verbatim-carried strings (path / summary / contentType / format / dbRef /
 * errorRef / code / message / operationId / baseUrl) are never translated. Only
 * structural keys and the status / protocol / auth / method / field-type / theme
 * value vocabularies are absorbed here.
 */

export type ApiSpecDictionaryScope =
  | 'root'
  | 'party'
  | 'endpoint'
  | 'request'
  | 'body'
  | 'field'
  | 'response'
  | 'error';

export type ApiSpecDictionary = Record<ApiSpecDictionaryScope, Record<string, string>>;

export const API_SPEC_JA_DICTIONARY: ApiSpecDictionary = {
  root: {
    スキーマ: 'schema',
    schema: 'schema',
    文書番号: 'documentNumber',
    documentNumber: 'documentNumber',
    番号: 'documentNumber',
    タイトル: 'title',
    title: 'title',
    表題: 'title',
    題名: 'title',
    版: 'version',
    version: 'version',
    バージョン: 'version',
    発行日: 'issueDate',
    issueDate: 'issueDate',
    発行年月日: 'issueDate',
    更新日: 'issueDate',
    ステータス: 'status',
    status: 'status',
    状態: 'status',
    プロトコル: 'protocol',
    protocol: 'protocol',
    認証: 'auth',
    認証方式: 'auth',
    auth: 'auth',
    ベースURL: 'baseUrl',
    基底URL: 'baseUrl',
    baseUrl: 'baseUrl',
    作成者: 'authors',
    authors: 'authors',
    著者: 'authors',
    起案者: 'authors',
    レビュアー: 'reviewers',
    reviewers: 'reviewers',
    レビュー者: 'reviewers',
    査読者: 'reviewers',
    関連文書: 'relatedDocs',
    relatedDocs: 'relatedDocs',
    関連資料: 'relatedDocs',
    参考資料: 'relatedDocs',
    エンドポイント: 'endpoints',
    endpoints: 'endpoints',
    エンドポイント一覧: 'endpoints',
    エラー: 'errors',
    errors: 'errors',
    エラー一覧: 'errors',
    エラーカタログ: 'errors',
    テーマ: 'theme',
    theme: 'theme',
    テーマカラー: 'theme',
    カラー: 'theme',
    色: 'theme',
    ファイル名: 'fileName',
    fileName: 'fileName',
    保存名: 'fileName',
  },
  party: {
    名前: 'name',
    name: 'name',
    名称: 'name',
    氏名: 'name',
    役割: 'role',
    role: 'role',
    肩書き: 'role',
    肩書: 'role',
    役職: 'role',
  },
  endpoint: {
    オペレーションID: 'operationId',
    操作ID: 'operationId',
    operationId: 'operationId',
    メソッド: 'method',
    HTTPメソッド: 'method',
    method: 'method',
    パス: 'path',
    path: 'path',
    経路: 'path',
    概要: 'summary',
    要約: 'summary',
    サマリ: 'summary',
    summary: 'summary',
    タグ: 'tags',
    tags: 'tags',
    認証: 'auth',
    auth: 'auth',
    リクエスト: 'request',
    request: 'request',
    要求: 'request',
    レスポンス: 'responses',
    responses: 'responses',
    応答: 'responses',
    非推奨: 'deprecated',
    deprecated: 'deprecated',
  },
  request: {
    パスパラメータ: 'pathParams',
    パスパラメーター: 'pathParams',
    pathParams: 'pathParams',
    クエリパラメータ: 'queryParams',
    クエリパラメーター: 'queryParams',
    クエリ: 'queryParams',
    queryParams: 'queryParams',
    ヘッダ: 'headers',
    ヘッダー: 'headers',
    headers: 'headers',
    ボディ: 'body',
    本文: 'body',
    リクエストボディ: 'body',
    body: 'body',
  },
  body: {
    コンテンツタイプ: 'contentType',
    contentType: 'contentType',
    メディアタイプ: 'contentType',
    MIME: 'contentType',
    フィールド: 'fields',
    fields: 'fields',
    項目: 'fields',
  },
  field: {
    名前: 'name',
    name: 'name',
    名称: 'name',
    フィールド名: 'name',
    項目名: 'name',
    型: 'type',
    type: 'type',
    タイプ: 'type',
    種類: 'type',
    必須: 'required',
    required: 'required',
    説明: 'description',
    description: 'description',
    概要: 'description',
    DB参照: 'dbRef',
    dbRef: 'dbRef',
    参照: 'dbRef',
    フォーマット: 'format',
    format: 'format',
    形式: 'format',
    要素: 'of',
    子要素: 'of',
    of: 'of',
  },
  response: {
    ステータス: 'status',
    ステータスコード: 'status',
    status: 'status',
    説明: 'description',
    description: 'description',
    概要: 'description',
    ボディ: 'body',
    本文: 'body',
    body: 'body',
    エラー参照: 'errorRef',
    errorRef: 'errorRef',
  },
  error: {
    コード: 'code',
    エラーコード: 'code',
    code: 'code',
    HTTPステータス: 'httpStatus',
    httpStatus: 'httpStatus',
    ステータスコード: 'httpStatus',
    メッセージ: 'message',
    message: 'message',
  },
};

/**
 * Status enum translations.
 */
export const STATUS_TRANSLATIONS: Record<string, string> = {
  ドラフト: 'draft',
  draft: 'draft',
  下書き: 'draft',
  レビュー中: 'review',
  レビュー: 'review',
  review: 'review',
  査読中: 'review',
  承認済: 'approved',
  承認済み: 'approved',
  承認: 'approved',
  approved: 'approved',
  廃止: 'deprecated',
  廃止済: 'deprecated',
  非推奨: 'deprecated',
  deprecated: 'deprecated',
};

/**
 * Protocol value translations. Absorbs casing / product spelling so the
 * canonical lower-case enum survives Ajv. Unknown values pass through verbatim.
 */
export const PROTOCOL_TRANSLATIONS: Record<string, string> = {
  REST: 'rest',
  Rest: 'rest',
  rest: 'rest',
  RPC: 'rpc',
  rpc: 'rpc',
  gRPC: 'rpc',
  grpc: 'rpc',
  GraphQL: 'graphql',
  graphql: 'graphql',
  GraphQl: 'graphql',
};

/**
 * Auth scheme translations. Shared by the document-level `auth` and per-endpoint
 * `auth` override.
 */
export const AUTH_TRANSLATIONS: Record<string, string> = {
  なし: 'none',
  none: 'none',
  無し: 'none',
  Bearer: 'bearer',
  bearer: 'bearer',
  Bearerトークン: 'bearer',
  APIキー: 'apiKey',
  apiKey: 'apiKey',
  apikey: 'apiKey',
  api_key: 'apiKey',
  OAuth2: 'oauth2',
  oauth2: 'oauth2',
  'OAuth 2.0': 'oauth2',
  Basic: 'basic',
  basic: 'basic',
  Basic認証: 'basic',
};

/**
 * HTTP method translations. Absorbs lower-case input so the canonical
 * upper-case enum survives Ajv. Unknown values pass through verbatim.
 */
export const METHOD_TRANSLATIONS: Record<string, string> = {
  get: 'GET',
  GET: 'GET',
  post: 'POST',
  POST: 'POST',
  put: 'PUT',
  PUT: 'PUT',
  patch: 'PATCH',
  PATCH: 'PATCH',
  delete: 'DELETE',
  DELETE: 'DELETE',
  head: 'HEAD',
  HEAD: 'HEAD',
  options: 'OPTIONS',
  OPTIONS: 'OPTIONS',
};

/**
 * Field data-type value translations. Lets authors write the Japanese type
 * vocabulary; canonical lower-case enum survives Ajv. Unknown values pass through.
 */
export const FIELD_TYPE_TRANSLATIONS: Record<string, string> = {
  文字列: 'string',
  string: 'string',
  整数: 'integer',
  integer: 'integer',
  数値: 'number',
  number: 'number',
  真偽: 'boolean',
  真偽値: 'boolean',
  boolean: 'boolean',
  配列: 'array',
  array: 'array',
  オブジェクト: 'object',
  object: 'object',
  日付: 'date',
  date: 'date',
  日時: 'datetime',
  datetime: 'datetime',
};

/**
 * Theme color translations — kept in sync with schema-invoice / schema-spec /
 * schema-test-spec / schema-db-spec so authors reuse the same vocabulary.
 */
export const THEME_VALUE_TRANSLATIONS: Record<string, string> = {
  青: 'blue',
  ブルー: 'blue',
  blue: 'blue',
  赤: 'red',
  レッド: 'red',
  red: 'red',
  黄: 'yellow',
  黄色: 'yellow',
  イエロー: 'yellow',
  yellow: 'yellow',
  橙: 'orange',
  オレンジ: 'orange',
  orange: 'orange',
  紫: 'purple',
  パープル: 'purple',
  purple: 'purple',
  黒: 'black',
  ブラック: 'black',
  black: 'black',
  灰: 'gray',
  灰色: 'gray',
  グレー: 'gray',
  グレイ: 'gray',
  gray: 'gray',
  grey: 'gray',
};
