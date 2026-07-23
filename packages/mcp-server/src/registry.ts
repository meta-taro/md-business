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

import validateInvoice from '@md-business/schema-invoice/validate';
import { invoiceSchema, SCHEMA_VERSION as INVOICE_ID } from '@md-business/schema-invoice';
import validateSpec from '@md-business/schema-spec/validate';
import { specSchema, SCHEMA_VERSION as SPEC_ID } from '@md-business/schema-spec';
import validateTestSpec from '@md-business/schema-test-spec/validate';
import { testSpecSchema, SCHEMA_VERSION as TEST_SPEC_ID } from '@md-business/schema-test-spec';
import validateDbSpec from '@md-business/schema-db-spec/validate';
import { dbSpecSchema, SCHEMA_VERSION as DB_SPEC_ID } from '@md-business/schema-db-spec';
import validateNosqlDbSpec from '@md-business/schema-nosql-db-spec/validate';
import {
  nosqlDbSpecSchema,
  SCHEMA_VERSION as NOSQL_ID,
} from '@md-business/schema-nosql-db-spec';
import validateApiSpec from '@md-business/schema-api-spec/validate';
import { apiSpecSchema, SCHEMA_VERSION as API_ID } from '@md-business/schema-api-spec';

/** レジストリ 1 エントリ。MCP ツールが必要とする最小限（描画は持たない）。 */
export interface SchemaEntry {
  /** 正本 schema id（`schema:` frontmatter に載る値・例 `invoice/v1`）。 */
  id: string;
  /** ペイン見出し / ツール応答用の日本語ラベル。 */
  label: string;
  /** standalone compiled validator（Ajv runtime 非依存・CSP セーフ）。 */
  validate: CompiledValidator;
  /** JSON Schema オブジェクト（get_schema / スキーマ一覧提示用）。 */
  schema: object;
}

export const SCHEMA_REGISTRY: readonly SchemaEntry[] = [
  { id: INVOICE_ID, label: '適格請求書', validate: validateInvoice, schema: invoiceSchema },
  { id: SPEC_ID, label: '基本設計書', validate: validateSpec, schema: specSchema },
  { id: TEST_SPEC_ID, label: '検証シート', validate: validateTestSpec, schema: testSpecSchema },
  { id: DB_SPEC_ID, label: 'DB 設計書（RDB）', validate: validateDbSpec, schema: dbSpecSchema },
  {
    id: NOSQL_ID,
    label: 'DB 設計書（NoSQL）',
    validate: validateNosqlDbSpec,
    schema: nosqlDbSpecSchema,
  },
  { id: API_ID, label: 'API 詳細設計書', validate: validateApiSpec, schema: apiSpecSchema },
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

/** frontmatter の `schema:` 値から既知 schema id を判定する。非文字列・未知・欠落は null。 */
export function detectSchemaId(frontmatter: Record<string, unknown>): string | null {
  const raw = frontmatter['schema'];
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return BY_ID.has(id) ? id : null;
}
