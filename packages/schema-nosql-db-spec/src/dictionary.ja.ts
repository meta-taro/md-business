/**
 * Japanese → English key dictionary for nosql-db-spec (NoSQL 設計書) frontmatter.
 *
 * Authors write Markdown frontmatter in Japanese, and
 * {@link normalizeNosqlDbSpecFrontmatter} maps keys to the canonical English
 * shape that `nosqlDbSpecSchema` validates.
 *
 * Notes:
 * - `shape` field NAMES are user data and are never translated — only the
 *   fieldDef keys inside each field definition are.
 * - `path` values keep Firestore `{placeholder}` notation verbatim (PdM
 *   decision C-2).
 * - `engineSpecific` is an escape hatch and passes through completely
 *   untranslated (PdM decision C-5).
 */

export type NosqlDbSpecDictionaryScope =
  | 'root'
  | 'party'
  | 'collection'
  | 'fieldDef'
  | 'index'
  | 'ttl'
  | 'securityRule';

export type NosqlDbSpecDictionary = Record<
  NosqlDbSpecDictionaryScope,
  Record<string, string>
>;

export const NOSQL_DB_SPEC_JA_DICTIONARY: NosqlDbSpecDictionary = {
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
    エンジン: 'engine',
    engine: 'engine',
    DBエンジン: 'engine',
    マルチリージョン: 'multiRegion',
    multiRegion: 'multiRegion',
    リージョン: 'multiRegion',
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
    コレクション: 'collections',
    collections: 'collections',
    コレクション定義: 'collections',
    セキュリティルール: 'securityRules',
    securityRules: 'securityRules',
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
  collection: {
    パス: 'path',
    path: 'path',
    説明: 'description',
    description: 'description',
    概要: 'description',
    ドキュメントID戦略: 'docIdStrategy',
    docIdStrategy: 'docIdStrategy',
    ID戦略: 'docIdStrategy',
    パーティションキー: 'partitionKeyField',
    partitionKeyField: 'partitionKeyField',
    ソートキー: 'sortKeyField',
    sortKeyField: 'sortKeyField',
    形状: 'shape',
    shape: 'shape',
    フィールド定義: 'shape',
    インデックス: 'indexes',
    indexes: 'indexes',
    索引: 'indexes',
    TTL: 'ttl',
    ttl: 'ttl',
    有効期限: 'ttl',
    エンジン固有: 'engineSpecific',
    engineSpecific: 'engineSpecific',
  },
  fieldDef: {
    型: 'type',
    type: 'type',
    タイプ: 'type',
    種類: 'type',
    必須: 'required',
    required: 'required',
    既定値: 'default',
    default: 'default',
    デフォルト: 'default',
    初期値: 'default',
    選択肢: 'enum',
    enum: 'enum',
    列挙: 'enum',
    説明: 'description',
    description: 'description',
    概要: 'description',
    要素: 'of',
    of: 'of',
    形状: 'shape',
    shape: 'shape',
  },
  index: {
    フィールド: 'fields',
    fields: 'fields',
    対象フィールド: 'fields',
    スコープ: 'scope',
    scope: 'scope',
    範囲: 'scope',
    モード: 'mode',
    mode: 'mode',
    並び順: 'mode',
  },
  ttl: {
    フィールド: 'field',
    field: 'field',
    対象フィールド: 'field',
    有効: 'enabled',
    enabled: 'enabled',
  },
  securityRule: {
    マッチ: 'match',
    match: 'match',
    対象: 'match',
    許可: 'allow',
    allow: 'allow',
    条件: 'if',
    if: 'if',
  },
};

/**
 * Status enum translations — same vocabulary as schema-db-spec.
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
 * Engine value translations. Absorbs product-name casing / spacing so the
 * canonical lower-case enum values survive Ajv. Unknown engines pass through
 * verbatim (enum 固定、不足時はバージョン bump — PdM decision B-1 と同運用).
 */
export const ENGINE_TRANSLATIONS: Record<string, string> = {
  Firestore: 'firestore',
  firestore: 'firestore',
  DynamoDB: 'dynamodb',
  dynamodb: 'dynamodb',
  MongoDB: 'mongodb',
  mongodb: 'mongodb',
  CosmosDB: 'cosmosdb',
  'Cosmos DB': 'cosmosdb',
  cosmosdb: 'cosmosdb',
  Redis: 'redis',
  redis: 'redis',
  DocumentDB: 'documentdb',
  'Amazon DocumentDB': 'documentdb',
  documentdb: 'documentdb',
  'Turso Document': 'turso-document',
  TursoDocument: 'turso-document',
  'turso-document': 'turso-document',
};

/**
 * docIdStrategy value translations (PdM decision C-1 abstraction).
 */
export const DOC_ID_STRATEGY_TRANSLATIONS: Record<string, string> = {
  UUID: 'uuid',
  uuid: 'uuid',
  自動: 'auto',
  auto: 'auto',
  認証UID: 'auth-uid',
  'auth-uid': 'auth-uid',
  複合: 'composite',
  複合キー: 'composite',
  composite: 'composite',
};

/**
 * Field type translations for shape field definitions. The canonical enum is
 * engine-agnostic (Firestore vocabulary as the common denominator), so unlike
 * RDB column types (B-2: verbatim SQL) these ARE absorbed here.
 */
export const FIELD_TYPE_TRANSLATIONS: Record<string, string> = {
  文字列: 'string',
  string: 'string',
  数値: 'number',
  number: 'number',
  真偽値: 'boolean',
  boolean: 'boolean',
  タイムスタンプ: 'timestamp',
  日時: 'timestamp',
  timestamp: 'timestamp',
  マップ: 'map',
  map: 'map',
  配列: 'array',
  array: 'array',
  参照: 'reference',
  reference: 'reference',
  位置情報: 'geopoint',
  geopoint: 'geopoint',
  バイト: 'bytes',
  bytes: 'bytes',
  ヌル: 'null',
  null: 'null',
};

/**
 * Index scope / mode value translations.
 */
export const INDEX_SCOPE_TRANSLATIONS: Record<string, string> = {
  コレクション: 'collection',
  collection: 'collection',
  コレクショングループ: 'collection-group',
  'collection-group': 'collection-group',
};

export const INDEX_MODE_TRANSLATIONS: Record<string, string> = {
  昇順: 'ASCENDING',
  ASCENDING: 'ASCENDING',
  降順: 'DESCENDING',
  DESCENDING: 'DESCENDING',
};

/**
 * Security-rule allow verb translations (Firestore rules vocabulary).
 */
export const ALLOW_VERB_TRANSLATIONS: Record<string, string> = {
  読み取り: 'read',
  read: 'read',
  書き込み: 'write',
  write: 'write',
  取得: 'get',
  get: 'get',
  一覧: 'list',
  list: 'list',
  作成: 'create',
  create: 'create',
  更新: 'update',
  update: 'update',
  削除: 'delete',
  delete: 'delete',
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
