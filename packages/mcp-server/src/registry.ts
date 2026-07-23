/**
 * MCP スキーマ・レジストリ（Issue 004 Phase 2）。
 * -----------------------------------------------------------------------------
 * 6 つの schema パッケージ（invoice / spec / test-spec / db-spec / nosql-db-spec /
 * api-spec）の公開 export だけを束ね、schema id → 検証器・JSON Schema・表示名を
 * 解決する。各パッケージの実装には一切触れない（§16）。chrome-extension の plugins /
 * desktop の previewFactory と同じ「薄い config を並べる」作法だが、MCP は描画を
 * 持たないので validate と JSON Schema のみを保持する。
 *
 * 検出は frontmatter の `schema:` 値（例 `invoice/v1`）を id に突き合わせる。MCP 経由で
 * エージェントが書く文書はテンプレ由来で必ず `schema:` を宣言するため、マーカー推論より
 * 明示宣言の照合を主信号にする。
 */
import type { CompiledValidator } from '@md-business/core';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { invoiceSchema, SCHEMA_VERSION as INVOICE_ID } from '@md-business/schema-invoice';
import { specSchema, SCHEMA_VERSION as SPEC_ID } from '@md-business/schema-spec';
import { testSpecSchema, SCHEMA_VERSION as TEST_SPEC_ID } from '@md-business/schema-test-spec';
import { dbSpecSchema, SCHEMA_VERSION as DB_SPEC_ID } from '@md-business/schema-db-spec';
import {
  nosqlDbSpecSchema,
  SCHEMA_VERSION as NOSQL_ID,
} from '@md-business/schema-nosql-db-spec';
import { apiSpecSchema, SCHEMA_VERSION as API_ID } from '@md-business/schema-api-spec';

/*
 * validator は各 schema パッケージの JSON Schema から実行時に Ajv でコンパイルする。
 * -----------------------------------------------------------------------------
 * schema パッケージが公開する standalone compiled validator（`/validate` export）は
 * bundler / Apps Script inline 向けで、`ajv/dist/runtime/*` を拡張子なし bare import
 * するため生 Node ESM では解決できない（MCP サーバーは初の raw-Node consumer）。
 * MCP は Node sidecar なので CSP 制約がなく、runtime Ajv（new Function）を使える。
 * schema パッケージ側は一切触らず（§16・他 consumer を壊さない）、こちらで JSON Schema
 * を draft 2020-12 の Ajv でコンパイルする。全 schema は `default` 未使用のため
 * useDefaults によるデータ変異は起きない（§19 で確認）。
 */
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

/** JSON Schema を CompiledValidator（standalone と同形の検証関数）へコンパイルする。 */
function compile(schema: object): CompiledValidator {
  return ajv.compile(schema) as CompiledValidator;
}

const validateInvoice = compile(invoiceSchema);
const validateSpec = compile(specSchema);
const validateTestSpec = compile(testSpecSchema);
const validateDbSpec = compile(dbSpecSchema);
const validateNosqlDbSpec = compile(nosqlDbSpecSchema);
const validateApiSpec = compile(apiSpecSchema);

/** レジストリ 1 エントリ。MCP ツールが必要とする最小限（描画は持たない）。 */
export interface SchemaEntry {
  /** 正本 schema id（`schema:` frontmatter に載る値・例 `invoice/v1`）。 */
  id: string;
  /** ペイン見出し / ツール応答用の日本語ラベル。 */
  label: string;
  /** JSON Schema から実行時コンパイルした検証関数（standalone validator と同形）。 */
  validate: CompiledValidator;
  /** JSON Schema オブジェクト（get_schema / スキーマ一覧提示用）。 */
  schema: object;
  /**
   * この種別の schema 宣言を載せる canonical な frontmatter キー。
   * create_document がここへ id を書き込む。invoice/spec は `schemaVersion`、
   * test-spec/db/nosql/api は `schema`（各 schema.json の required で確認・§19）。
   */
  schemaKey: 'schema' | 'schemaVersion';
}

export const SCHEMA_REGISTRY: readonly SchemaEntry[] = [
  {
    id: INVOICE_ID,
    label: '適格請求書',
    validate: validateInvoice,
    schema: invoiceSchema,
    schemaKey: 'schemaVersion',
  },
  {
    id: SPEC_ID,
    label: '基本設計書',
    validate: validateSpec,
    schema: specSchema,
    schemaKey: 'schemaVersion',
  },
  {
    id: TEST_SPEC_ID,
    label: '検証シート',
    validate: validateTestSpec,
    schema: testSpecSchema,
    schemaKey: 'schema',
  },
  {
    id: DB_SPEC_ID,
    label: 'DB 設計書（RDB）',
    validate: validateDbSpec,
    schema: dbSpecSchema,
    schemaKey: 'schema',
  },
  {
    id: NOSQL_ID,
    label: 'DB 設計書（NoSQL）',
    validate: validateNosqlDbSpec,
    schema: nosqlDbSpecSchema,
    schemaKey: 'schema',
  },
  {
    id: API_ID,
    label: 'API 詳細設計書',
    validate: validateApiSpec,
    schema: apiSpecSchema,
    schemaKey: 'schema',
  },
];

/** id → エントリの索引（解決を O(1) に）。 */
const BY_ID = new Map<string, SchemaEntry>(SCHEMA_REGISTRY.map((e) => [e.id, e]));

/** 対応スキーマの id + label 一覧（validator 本体は伏せる）。 */
export function listSchemas(): { id: string; label: string }[] {
  return SCHEMA_REGISTRY.map((e) => ({ id: e.id, label: e.label }));
}

/** schema id からエントリを解決する。未知は null。 */
export function resolveSchema(id: string): SchemaEntry | null {
  return BY_ID.get(id) ?? null;
}

/**
 * schema 宣言に使われうる frontmatter キー（先頭優先）。
 * canonical は種別で割れる（invoice/spec は `schemaVersion`、test-spec/db/nosql/api は
 * `schema`）うえ、日本語テンプレは `スキーマ` エイリアス。normalize を通さずに素の
 * frontmatter から検出できるよう、実テンプレで確認した候補キーを走査する（§19）。
 */
const SCHEMA_KEYS = ['schema', 'schemaVersion', 'スキーマ'] as const;

/** frontmatter の schema 宣言（schema / schemaVersion / スキーマ）から既知 id を判定する。 */
export function detectSchemaId(frontmatter: Record<string, unknown>): string | null {
  for (const key of SCHEMA_KEYS) {
    const raw = frontmatter[key];
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (BY_ID.has(id)) return id;
  }
  return null;
}
