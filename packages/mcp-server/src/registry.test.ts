import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION as INVOICE_V } from '@md-business/schema-invoice';
import { SCHEMA_VERSION as SPEC_V } from '@md-business/schema-spec';
import { SCHEMA_VERSION as TEST_SPEC_V } from '@md-business/schema-test-spec';
import { SCHEMA_VERSION as DB_SPEC_V } from '@md-business/schema-db-spec';
import { SCHEMA_VERSION as NOSQL_V } from '@md-business/schema-nosql-db-spec';
import { SCHEMA_VERSION as API_V } from '@md-business/schema-api-spec';
import { SCHEMA_REGISTRY, listSchemas, resolveSchema, detectSchemaId } from './registry.js';

/**
 * MCP スキーマ・レジストリ（Issue 004 Phase 2）。6 スキーマパッケージを wrap し、
 * schema id → { label, validate, schema } を解決する。既存パッケージは非改変で、
 * ここは公開 export（`/validate` compiled validator + SCHEMA_VERSION + JSON Schema）を
 * 束ねるだけ（§16）。検出は frontmatter の `schema:` 値（例 `invoice/v1`）を照合する。
 */
describe('SCHEMA_REGISTRY', () => {
  it('6 スキーマを登録し、id は各パッケージの SCHEMA_VERSION と一致する', () => {
    const ids = SCHEMA_REGISTRY.map((e) => e.id);
    expect(ids).toEqual([INVOICE_V, SPEC_V, TEST_SPEC_V, DB_SPEC_V, NOSQL_V, API_V]);
  });

  it('id は重複しない', () => {
    const ids = SCHEMA_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('各エントリは validate 関数・JSON Schema・日本語ラベルを持つ', () => {
    for (const entry of SCHEMA_REGISTRY) {
      expect(typeof entry.validate).toBe('function');
      expect(entry.schema).toBeTypeOf('object');
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});

describe('listSchemas', () => {
  it('id + label のメタだけを返す（validator 本体は含めない）', () => {
    const list = listSchemas();
    expect(list).toHaveLength(6);
    expect(list[0]).toEqual({ id: INVOICE_V, label: expect.any(String) });
    expect(list[0]).not.toHaveProperty('validate');
  });
});

describe('resolveSchema', () => {
  it('既知 id を解決する', () => {
    const entry = resolveSchema(TEST_SPEC_V);
    expect(entry?.id).toBe(TEST_SPEC_V);
    expect(typeof entry?.validate).toBe('function');
  });

  it('未知 id は null', () => {
    expect(resolveSchema('unknown/v9')).toBeNull();
    expect(resolveSchema('')).toBeNull();
  });
});

describe('detectSchemaId', () => {
  it('frontmatter の schema 値が既知なら id を返す', () => {
    expect(detectSchemaId({ schema: SPEC_V, title: 'x' })).toBe(SPEC_V);
  });

  it('schema 宣言キーは種別で揺れる（schemaVersion / スキーマ も走査する）', () => {
    // invoice / spec は canonical が schemaVersion（テンプレ実物・§19 で確認）
    expect(detectSchemaId({ schemaVersion: INVOICE_V })).toBe(INVOICE_V);
    // 日本語テンプレは スキーマ エイリアス（spec/test-spec/api-spec の standard-ja）
    expect(detectSchemaId({ スキーマ: SPEC_V })).toBe(SPEC_V);
    expect(detectSchemaId({ スキーマ: TEST_SPEC_V })).toBe(TEST_SPEC_V);
  });

  it('canonical schema キーを優先する（複数キーがあっても schema が先勝ち）', () => {
    expect(detectSchemaId({ schema: TEST_SPEC_V, スキーマ: SPEC_V })).toBe(TEST_SPEC_V);
  });

  it('schema 値が未知・欠落・非文字列なら null', () => {
    expect(detectSchemaId({ schema: 'nope/v1' })).toBeNull();
    expect(detectSchemaId({ title: 'no schema key' })).toBeNull();
    expect(detectSchemaId({ schema: 123 })).toBeNull();
    expect(detectSchemaId({})).toBeNull();
  });

  it('前後空白を除いて照合する', () => {
    expect(detectSchemaId({ schemaVersion: `  ${INVOICE_V}  ` })).toBe(INVOICE_V);
  });
});
