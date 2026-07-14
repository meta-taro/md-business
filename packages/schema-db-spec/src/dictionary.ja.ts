/**
 * Japanese → English key dictionary for db-spec (RDB 設計書) frontmatter.
 *
 * Authors write Markdown frontmatter in Japanese, and {@link normalizeDbSpecFrontmatter}
 * maps keys to the canonical English shape that {@link dbSpecSchema} validates.
 *
 * Note: column `type` VALUES are never translated — engine-native SQL type
 * expressions are canonical (PdM decision B-2). Only structural keys and the
 * status / engine / theme value vocabularies are absorbed here.
 */

export type DbSpecDictionaryScope =
  | 'root'
  | 'party'
  | 'table'
  | 'column'
  | 'fk'
  | 'index'
  | 'trigger'
  | 'migration';

export type DbSpecDictionary = Record<DbSpecDictionaryScope, Record<string, string>>;

export const DB_SPEC_JA_DICTIONARY: DbSpecDictionary = {
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
    文字コード: 'charset',
    文字セット: 'charset',
    charset: 'charset',
    照合順序: 'collation',
    コレーション: 'collation',
    collation: 'collation',
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
    テーブル: 'tables',
    tables: 'tables',
    表: 'tables',
    テーブル定義: 'tables',
    マイグレーション: 'migrations',
    migrations: 'migrations',
    移行履歴: 'migrations',
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
  table: {
    名前: 'name',
    name: 'name',
    テーブル名: 'name',
    表名: 'name',
    説明: 'description',
    description: 'description',
    概要: 'description',
    列: 'columns',
    columns: 'columns',
    カラム: 'columns',
    項目: 'columns',
    列定義: 'columns',
    インデックス: 'indexes',
    indexes: 'indexes',
    索引: 'indexes',
    トリガー: 'triggers',
    triggers: 'triggers',
  },
  column: {
    名前: 'name',
    name: 'name',
    列名: 'name',
    カラム名: 'name',
    項目名: 'name',
    型: 'type',
    type: 'type',
    タイプ: 'type',
    種類: 'type',
    主キー: 'pk',
    pk: 'pk',
    主キー列: 'pk',
    NULL許可: 'nullable',
    null許可: 'nullable',
    ヌル許可: 'nullable',
    nullable: 'nullable',
    一意: 'unique',
    unique: 'unique',
    ユニーク: 'unique',
    既定値: 'default',
    default: 'default',
    デフォルト: 'default',
    初期値: 'default',
    外部キー: 'fk',
    fk: 'fk',
  },
  fk: {
    テーブル: 'table',
    table: 'table',
    参照テーブル: 'table',
    参照先: 'table',
    列: 'column',
    column: 'column',
    カラム: 'column',
    参照列: 'column',
    削除時: 'onDelete',
    onDelete: 'onDelete',
    更新時: 'onUpdate',
    onUpdate: 'onUpdate',
  },
  index: {
    名前: 'name',
    name: 'name',
    インデックス名: 'name',
    列: 'columns',
    columns: 'columns',
    カラム: 'columns',
    対象列: 'columns',
    一意: 'unique',
    unique: 'unique',
    ユニーク: 'unique',
    方式: 'using',
    using: 'using',
    インデックス方式: 'using',
  },
  trigger: {
    名前: 'name',
    name: 'name',
    トリガー名: 'name',
    契機: 'on',
    on: 'on',
    タイミング: 'on',
    処理: 'action',
    action: 'action',
    アクション: 'action',
  },
  migration: {
    ID: 'id',
    id: 'id',
    識別子: 'id',
    説明: 'description',
    description: 'description',
    概要: 'description',
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
 * Engine value translations. Absorbs product-name casing / spacing so the
 * canonical lower-case enum values survive Ajv. Unknown engines pass through
 * verbatim (PdM decision B-1: enum 8 種固定、不足時はバージョン bump).
 */
export const ENGINE_TRANSLATIONS: Record<string, string> = {
  PostgreSQL: 'postgres',
  postgresql: 'postgres',
  Postgres: 'postgres',
  postgres: 'postgres',
  MySQL: 'mysql',
  mysql: 'mysql',
  Aurora: 'aurora',
  aurora: 'aurora',
  SQLite: 'sqlite',
  sqlite: 'sqlite',
  Neon: 'neon',
  neon: 'neon',
  Supabase: 'supabase',
  supabase: 'supabase',
  Turso: 'turso',
  turso: 'turso',
  CloudSQL: 'cloudsql',
  'Cloud SQL': 'cloudsql',
  cloudsql: 'cloudsql',
};

/**
 * Theme color translations — kept in sync with schema-invoice / schema-spec /
 * schema-test-spec so authors reuse the same vocabulary across document types.
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
