import { describe, it, expect } from 'vitest';
import { normalizeNosqlDbSpecFrontmatter } from '../src/index.js';

describe('normalizeNosqlDbSpecFrontmatter — input guards', () => {
  it('returns empty data for non-objects', () => {
    expect(normalizeNosqlDbSpecFrontmatter(null).data).toEqual({});
    expect(normalizeNosqlDbSpecFrontmatter(undefined).data).toEqual({});
    expect(normalizeNosqlDbSpecFrontmatter('x').data).toEqual({});
    expect(normalizeNosqlDbSpecFrontmatter([1]).data).toEqual({});
  });
});

describe('normalizeNosqlDbSpecFrontmatter — root keys', () => {
  it('translates the full Japanese root vocabulary', () => {
    const { data, warnings } = normalizeNosqlDbSpecFrontmatter({
      スキーマ: 'nosql-db-spec/v1',
      文書番号: 'NOSQL-2026-001',
      タイトル: '通知基盤 Firestore 設計',
      版: '1.0.0',
      発行日: '2026-06-26',
      ステータス: 'draft',
      エンジン: 'firestore',
      マルチリージョン: 'nam5',
      関連文書: ['DB-2026-001'],
      テーマ: 'blue',
      ファイル名: 'X_{文書番号}',
    });
    expect(warnings).toEqual([]);
    expect(data).toEqual({
      schema: 'nosql-db-spec/v1',
      documentNumber: 'NOSQL-2026-001',
      title: '通知基盤 Firestore 設計',
      version: '1.0.0',
      issueDate: '2026-06-26',
      status: 'draft',
      engine: 'firestore',
      multiRegion: 'nam5',
      relatedDocs: ['DB-2026-001'],
      theme: 'blue',
      fileName: 'X_{文書番号}',
    });
  });

  it.each([
    ['ドラフト', 'draft'],
    ['レビュー中', 'review'],
    ['承認済', 'approved'],
    ['廃止', 'deprecated'],
  ])('translates status value %s → %s', (ja, en) => {
    const { data } = normalizeNosqlDbSpecFrontmatter({ ステータス: ja });
    expect(data['status']).toBe(en);
  });

  it.each([
    ['Firestore', 'firestore'],
    ['DynamoDB', 'dynamodb'],
    ['MongoDB', 'mongodb'],
    ['CosmosDB', 'cosmosdb'],
    ['Cosmos DB', 'cosmosdb'],
    ['Redis', 'redis'],
    ['DocumentDB', 'documentdb'],
    ['Turso Document', 'turso-document'],
  ])('translates engine value %s → %s', (raw, canonical) => {
    const { data } = normalizeNosqlDbSpecFrontmatter({ エンジン: raw });
    expect(data['engine']).toBe(canonical);
  });

  it('translates theme color 青 → blue', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({ テーマ: '青' });
    expect(data['theme']).toBe('blue');
  });

  it('passes unknown engine values through verbatim', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({ エンジン: 'oracle-nosql' });
    expect(data['engine']).toBe('oracle-nosql');
  });
});

describe('normalizeNosqlDbSpecFrontmatter — party scope', () => {
  it('translates authors and reviewers entries', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      作成者: [{ 名前: '田中', 役割: 'PdM' }],
      レビュアー: [{ 氏名: 'ソウ' }],
    });
    expect(data['authors']).toEqual([{ name: '田中', role: 'PdM' }]);
    expect(data['reviewers']).toEqual([{ name: 'ソウ' }]);
  });
});

describe('normalizeNosqlDbSpecFrontmatter — collection scope', () => {
  it('translates collection keys and docIdStrategy values', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [
        {
          パス: 'users/{userId}/orders',
          説明: '注文',
          ドキュメントID戦略: '自動',
          形状: { total: { 型: '数値' } },
        },
      ],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    expect(collections[0]?.['path']).toBe('users/{userId}/orders');
    expect(collections[0]?.['description']).toBe('注文');
    expect(collections[0]?.['docIdStrategy']).toBe('auto');
    expect(collections[0]?.['shape']).toEqual({ total: { type: 'number' } });
  });

  it.each([
    ['UUID', 'uuid'],
    ['自動', 'auto'],
    ['認証UID', 'auth-uid'],
    ['複合', 'composite'],
    ['composite', 'composite'],
  ])('translates docIdStrategy %s → %s', (ja, en) => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [{ パス: 'x', ドキュメントID戦略: ja }],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    expect(collections[0]?.['docIdStrategy']).toBe(en);
  });

  it('translates partition / sort key fields', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [
        {
          パス: 'orders',
          ドキュメントID戦略: '複合',
          パーティションキー: 'tenantId',
          ソートキー: 'createdAt',
        },
      ],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    expect(collections[0]?.['partitionKeyField']).toBe('tenantId');
    expect(collections[0]?.['sortKeyField']).toBe('createdAt');
  });

  it('keeps path placeholders verbatim (C-2)', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [{ パス: 'tenants/{tenantId}/logs/{logId}' }],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    expect(collections[0]?.['path']).toBe('tenants/{tenantId}/logs/{logId}');
  });

  it('passes engineSpecific through completely untranslated', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [
        {
          パス: 'x',
          エンジン固有: { 型: 'これはユーザーデータ', billingMode: 'PAY_PER_REQUEST' },
        },
      ],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    expect(collections[0]?.['engineSpecific']).toEqual({
      型: 'これはユーザーデータ',
      billingMode: 'PAY_PER_REQUEST',
    });
  });
});

describe('normalizeNosqlDbSpecFrontmatter — shape / fieldDef scope', () => {
  it('keeps shape field names verbatim while translating fieldDef keys', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [
        {
          パス: 'users',
          形状: {
            表示名: { 型: '文字列', 必須: true },
            メール: { 型: '文字列', 説明: '連絡先' },
          },
        },
      ],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    expect(collections[0]?.['shape']).toEqual({
      表示名: { type: 'string', required: true },
      メール: { type: 'string', description: '連絡先' },
    });
  });

  it.each([
    ['文字列', 'string'],
    ['数値', 'number'],
    ['真偽値', 'boolean'],
    ['タイムスタンプ', 'timestamp'],
    ['マップ', 'map'],
    ['配列', 'array'],
    ['参照', 'reference'],
    ['位置情報', 'geopoint'],
    ['バイト', 'bytes'],
    ['ヌル', 'null'],
  ])('translates field type %s → %s', (ja, en) => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [{ パス: 'x', 形状: { f: { 型: ja } } }],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    const shape = collections[0]?.['shape'] as Record<string, Record<string, unknown>>;
    expect(shape['f']?.['type']).toBe(en);
  });

  it('recurses through array-of and nested map shapes', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [
        {
          パス: 'orders',
          形状: {
            items: {
              型: '配列',
              要素: {
                型: 'マップ',
                形状: {
                  sku: { 型: '文字列', 必須: true },
                  qty: { 型: '数値', 既定値: 1 },
                },
              },
            },
          },
        },
      ],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    expect(collections[0]?.['shape']).toEqual({
      items: {
        type: 'array',
        of: {
          type: 'map',
          shape: {
            sku: { type: 'string', required: true },
            qty: { type: 'number', default: 1 },
          },
        },
      },
    });
  });

  it('translates enum / default keys but keeps their values verbatim', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [
        {
          パス: 'x',
          形状: {
            state: { 型: '文字列', 選択肢: ['有効', '無効'], 既定値: '有効' },
          },
        },
      ],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    const shape = collections[0]?.['shape'] as Record<string, Record<string, unknown>>;
    expect(shape['state']?.['enum']).toEqual(['有効', '無効']);
    expect(shape['state']?.['default']).toBe('有効');
  });
});

describe('normalizeNosqlDbSpecFrontmatter — index / ttl scope', () => {
  it('translates index keys and scope / mode values', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [
        {
          パス: 'x',
          インデックス: [
            { フィールド: ['createdAt'], スコープ: 'コレクショングループ', モード: '降順' },
          ],
        },
      ],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    const indexes = collections[0]?.['indexes'] as Array<Record<string, unknown>>;
    expect(indexes[0]).toEqual({
      fields: ['createdAt'],
      scope: 'collection-group',
      mode: 'DESCENDING',
    });
  });

  it.each([
    ['昇順', 'ASCENDING'],
    ['降順', 'DESCENDING'],
    ['ASCENDING', 'ASCENDING'],
  ])('translates index mode %s → %s', (ja, en) => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [{ パス: 'x', インデックス: [{ フィールド: ['f'], モード: ja }] }],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    const indexes = collections[0]?.['indexes'] as Array<Record<string, unknown>>;
    expect(indexes[0]?.['mode']).toBe(en);
  });

  it('translates ttl keys', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [
        { パス: 'x', TTL: { フィールド: 'expiresAt', 有効: true } },
      ],
    });
    const collections = data['collections'] as Array<Record<string, unknown>>;
    expect(collections[0]?.['ttl']).toEqual({ field: 'expiresAt', enabled: true });
  });
});

describe('normalizeNosqlDbSpecFrontmatter — securityRule scope', () => {
  it('translates securityRules keys and allow verbs', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      セキュリティルール: [
        {
          対象: '/databases/{db}/documents/users/{userId}',
          許可: ['読み取り', '更新'],
          条件: 'request.auth.uid == userId',
        },
      ],
    });
    expect(data['securityRules']).toEqual([
      {
        match: '/databases/{db}/documents/users/{userId}',
        allow: ['read', 'update'],
        if: 'request.auth.uid == userId',
      },
    ]);
  });

  it.each([
    ['読み取り', 'read'],
    ['書き込み', 'write'],
    ['取得', 'get'],
    ['一覧', 'list'],
    ['作成', 'create'],
    ['更新', 'update'],
    ['削除', 'delete'],
    ['read', 'read'],
  ])('translates allow verb %s → %s', (ja, en) => {
    const { data } = normalizeNosqlDbSpecFrontmatter({
      セキュリティルール: [{ 対象: 'm', 許可: [ja] }],
    });
    const rules = data['securityRules'] as Array<Record<string, unknown>>;
    expect(rules[0]?.['allow']).toEqual([en]);
  });
});

describe('normalizeNosqlDbSpecFrontmatter — collisions and pass-through', () => {
  it('warns when two input keys map to the same canonical key', () => {
    const { warnings } = normalizeNosqlDbSpecFrontmatter({
      タイトル: 'A',
      title: 'B',
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('title');
    expect(warnings[0]?.message).toContain('Multiple input keys mapped to');
  });

  it('warns with a full path for nested collisions', () => {
    const { warnings } = normalizeNosqlDbSpecFrontmatter({
      コレクション: [{ パス: 'a', path: 'b' }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('collections[0].path');
  });

  it('passes unknown keys through verbatim for Ajv to flag', () => {
    const { data } = normalizeNosqlDbSpecFrontmatter({ 謎キー: 1 });
    expect(data['謎キー']).toBe(1);
  });
});
