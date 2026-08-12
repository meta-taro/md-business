import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION as INVOICE_V } from '@md-business/schema-invoice';
import { SCHEMA_VERSION as SPEC_V } from '@md-business/schema-spec';
import { SCHEMA_VERSION as TEST_SPEC_V } from '@md-business/schema-test-spec';
import { SCHEMA_VERSION as DB_SPEC_V } from '@md-business/schema-db-spec';
import { SCHEMA_VERSION as NOSQL_V } from '@md-business/schema-nosql-db-spec';
import { SCHEMA_VERSION as API_V } from '@md-business/schema-api-spec';
import { SCHEMA_VERSION as INVESTIGATION_V } from '@md-business/schema-investigation';
import {
  SCHEMA_REGISTRY,
  listSchemas,
  resolveSchema,
  getSchemaDefinition,
  detectSchemaId,
} from './registry.js';

/**
 * MCP スキーマ・レジストリ。7 スキーマパッケージを wrap し、
 * schema id → { label, validate, schema } を解決する。既存パッケージは非改変で、
 * ここは公開 export（`/validate` compiled validator + SCHEMA_VERSION + JSON Schema）を
 * 束ねるだけ。検出は frontmatter の `schema:` 値（例 `invoice/v1`）を照合する。
 */
describe('SCHEMA_REGISTRY', () => {
  it('7 スキーマを登録し、id は各パッケージの SCHEMA_VERSION と一致する', () => {
    const ids = SCHEMA_REGISTRY.map((e) => e.id);
    expect(ids).toEqual([
      INVOICE_V,
      SPEC_V,
      TEST_SPEC_V,
      DB_SPEC_V,
      NOSQL_V,
      API_V,
      INVESTIGATION_V,
    ]);
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

  it('schemaKey は種別で割れる（invoice/spec は schemaVersion、他は schema）', () => {
    const byId = new Map(SCHEMA_REGISTRY.map((e) => [e.id, e.schemaKey]));
    expect(byId.get(INVOICE_V)).toBe('schemaVersion');
    expect(byId.get(SPEC_V)).toBe('schemaVersion');
    expect(byId.get(TEST_SPEC_V)).toBe('schema');
    expect(byId.get(DB_SPEC_V)).toBe('schema');
    expect(byId.get(NOSQL_V)).toBe('schema');
    expect(byId.get(API_V)).toBe('schema');
    expect(byId.get(INVESTIGATION_V)).toBe('schema');
  });
});

describe('listSchemas', () => {
  it('id + label のメタだけを返す（validator 本体は含めない）', () => {
    const list = listSchemas();
    expect(list).toHaveLength(7);
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

describe('getSchemaDefinition', () => {
  it('既知 id の JSON Schema 本体をラベル付きで返す', () => {
    const def = getSchemaDefinition(INVOICE_V);
    expect(def?.id).toBe(INVOICE_V);
    expect(def?.label.length).toBeGreaterThan(0);
    // JSON Schema そのもの（properties を持つ）が返る＝エージェントが項目を読める
    expect(def?.schema).toHaveProperty('properties');
  });

  it('validator 本体は載せない（JSON 化できる形だけを返す）', () => {
    const def = getSchemaDefinition(SPEC_V);
    expect(def).not.toHaveProperty('validate');
    expect(() => JSON.stringify(def)).not.toThrow();
  });

  it('前後空白を除いて照合する', () => {
    expect(getSchemaDefinition(`  ${TEST_SPEC_V}  `)?.id).toBe(TEST_SPEC_V);
  });

  it('未知 id は null', () => {
    expect(getSchemaDefinition('unknown/v9')).toBeNull();
    expect(getSchemaDefinition('')).toBeNull();
  });
});

describe('detectSchemaId', () => {
  it('frontmatter の schema 値が既知なら id を返す', () => {
    expect(detectSchemaId({ schema: SPEC_V, title: 'x' })).toBe(SPEC_V);
  });

  it('schema 宣言キーは種別で揺れる（schemaVersion / スキーマ も走査する）', () => {
    // invoice / spec は canonical が schemaVersion（テンプレ実物で確認済み）
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

describe('investigation/v1 の検証', () => {
  const validate = resolveSchema(INVESTIGATION_V)!.validate;

  function japaneseInvestigation(): Record<string, unknown> {
    return {
      スキーマ: INVESTIGATION_V,
      種別: 'ログ',
      文書番号: 'INV-2026-0001',
      タイトル: '深夜帯のログイン失敗急増の調査',
      作成日時: '2026-08-12T09:30:00+09:00',
      状態: '調査中',
      作成者: [{ 名前: '山田 太郎', 役割: '調査担当' }],
      対象ファイル: [
        {
          パス: 'logs/app-2026-08-11.jsonl',
          ハッシュ: '3b1f0c6a9d4e2f8b7c5a1d0e6f4b2a9c8d7e5f3a1b0c9d8e7f6a5b4c3d2e1f00',
        },
      ],
      使用ツール: [{ 名前: 'md-business mcp-server', 版: '0.9.0' }],
      調査時間帯: { 開始: '2026-08-11T00:00:00+09:00', 終了: '2026-08-12T00:00:00+09:00' },
    };
  }

  it('日本語キーの調査報告書を通す（normalize → autofill → validate の 3 段が揃っている）', () => {
    expect(validate(japaneseInvestigation())).toBe(true);
  });

  it('根拠が Evidence 参照でない所見を落とす', () => {
    const doc = {
      ...japaneseInvestigation(),
      所見: [{ 番号: 'F-01', 要約: '認証失敗が集中している', 根拠: ['ログを見た感じ'] }],
    };
    expect(validate(doc)).toBe(false);
  });

  it('対象ファイルのハッシュが無い調査報告書を落とす', () => {
    const doc = japaneseInvestigation();
    doc['対象ファイル'] = [{ パス: 'logs/app.jsonl' }];
    expect(validate(doc)).toBe(false);
  });
});
