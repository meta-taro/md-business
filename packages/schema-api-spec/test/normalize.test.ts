import { describe, it, expect } from 'vitest';
import { normalizeApiSpecFrontmatter } from '../src/index.js';

describe('normalizeApiSpecFrontmatter — root scope', () => {
  it('returns empty data when given a non-object', () => {
    expect(normalizeApiSpecFrontmatter(null).data).toEqual({});
    expect(normalizeApiSpecFrontmatter('x').data).toEqual({});
    expect(normalizeApiSpecFrontmatter(42).data).toEqual({});
  });

  it('translates canonical Japanese root keys to English', () => {
    const { data, warnings } = normalizeApiSpecFrontmatter({
      スキーマ: 'api-spec/v1',
      文書番号: 'API-2026-001',
      タイトル: '受発注 API 詳細設計',
      版: '0.1.0',
      発行日: '2026-07-15',
      ステータス: 'ドラフト',
      プロトコル: 'REST',
      認証: 'Bearer',
      ベースURL: 'https://api.example.com/v1',
      作成者: [{ 名前: '田中', 役割: '設計担当' }],
      レビュアー: [{ 名前: '山田' }],
      関連文書: ['./../db-spec/order-db.md'],
      テーマ: '青',
      ファイル名: 'API設計書_{文書番号}_v{版}',
    });
    expect(warnings).toEqual([]);
    expect(data).toMatchObject({
      schema: 'api-spec/v1',
      documentNumber: 'API-2026-001',
      title: '受発注 API 詳細設計',
      version: '0.1.0',
      issueDate: '2026-07-15',
      status: 'draft',
      protocol: 'rest',
      auth: 'bearer',
      baseUrl: 'https://api.example.com/v1',
      relatedDocs: ['./../db-spec/order-db.md'],
      theme: 'blue',
      fileName: 'API設計書_{文書番号}_v{版}',
    });
    expect(data.authors).toEqual([{ name: '田中', role: '設計担当' }]);
    expect(data.reviewers).toEqual([{ name: '山田' }]);
  });

  it.each([['エンドポイント'], ['エンドポイント一覧'], ['endpoints']])(
    'maps root key "%s" → endpoints',
    (key) => {
      const { data } = normalizeApiSpecFrontmatter({ [key]: [] });
      expect(data.endpoints).toEqual([]);
    },
  );

  it.each([['エラー'], ['エラー一覧'], ['errors']])('maps root key "%s" → errors', (key) => {
    const { data } = normalizeApiSpecFrontmatter({ [key]: [] });
    expect(data.errors).toEqual([]);
  });

  it('does not pollute Object.prototype via a __proto__ frontmatter key', () => {
    const malicious = JSON.parse('{"__proto__": {"polluted": true}, "文書番号": "API-1"}');
    const { data } = normalizeApiSpecFrontmatter(malicious);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
    expect((data as Record<string, unknown>).polluted).toBeUndefined();
    expect(data.documentNumber).toBe('API-1');
  });

  it('accepts English keys verbatim (idempotent)', () => {
    const english = {
      schema: 'api-spec/v1',
      documentNumber: 'API-1',
      title: 't',
      version: '0.1.0',
      issueDate: '2026-07-15',
      status: 'draft',
      protocol: 'rest',
      auth: 'bearer',
      authors: [{ name: 'a' }],
      endpoints: [{ operationId: 'x', method: 'GET', path: '/x', responses: [{ status: 200 }] }],
    };
    const { data } = normalizeApiSpecFrontmatter(english);
    expect(data).toMatchObject(english);
  });
});

describe('normalizeApiSpecFrontmatter — value translations', () => {
  it.each([
    ['ドラフト', 'draft'],
    ['レビュー中', 'review'],
    ['承認済み', 'approved'],
    ['廃止', 'deprecated'],
    ['approved', 'approved'],
  ])('maps status "%s" → "%s"', (input, expected) => {
    expect(normalizeApiSpecFrontmatter({ ステータス: input }).data.status).toBe(expected);
  });

  it.each([
    ['REST', 'rest'],
    ['rest', 'rest'],
    ['RPC', 'rpc'],
    ['gRPC', 'rpc'],
    ['GraphQL', 'graphql'],
  ])('maps protocol "%s" → "%s"', (input, expected) => {
    expect(normalizeApiSpecFrontmatter({ プロトコル: input }).data.protocol).toBe(expected);
  });

  it.each([
    ['なし', 'none'],
    ['Bearer', 'bearer'],
    ['APIキー', 'apiKey'],
    ['OAuth 2.0', 'oauth2'],
    ['Basic認証', 'basic'],
  ])('maps auth "%s" → "%s"', (input, expected) => {
    expect(normalizeApiSpecFrontmatter({ 認証: input }).data.auth).toBe(expected);
  });

  it.each([
    ['青', 'blue'],
    ['オレンジ', 'orange'],
    ['グレー', 'gray'],
  ])('maps theme "%s" → "%s"', (input, expected) => {
    expect(normalizeApiSpecFrontmatter({ テーマ: input }).data.theme).toBe(expected);
  });

  it('passes through an unknown status / protocol / auth value (Ajv will reject)', () => {
    expect(normalizeApiSpecFrontmatter({ ステータス: '保留' }).data.status).toBe('保留');
    expect(normalizeApiSpecFrontmatter({ プロトコル: 'soap' }).data.protocol).toBe('soap');
    expect(normalizeApiSpecFrontmatter({ 認証: 'jwt' }).data.auth).toBe('jwt');
  });
});

describe('normalizeApiSpecFrontmatter — endpoint scope', () => {
  it('translates endpoint keys and lower-case methods', () => {
    const { data } = normalizeApiSpecFrontmatter({
      エンドポイント: [
        {
          オペレーションID: 'listUsers',
          メソッド: 'get',
          パス: '/users',
          概要: '利用者一覧',
          タグ: ['users', 'admin'],
          認証: 'なし',
          非推奨: false,
        },
      ],
    });
    expect(data.endpoints).toEqual([
      {
        operationId: 'listUsers',
        method: 'GET',
        path: '/users',
        summary: '利用者一覧',
        tags: ['users', 'admin'],
        auth: 'none',
        deprecated: false,
      },
    ]);
  });

  it.each([
    ['get', 'GET'],
    ['post', 'POST'],
    ['DELETE', 'DELETE'],
    ['patch', 'PATCH'],
  ])('maps method "%s" → "%s"', (input, expected) => {
    const { data } = normalizeApiSpecFrontmatter({
      エンドポイント: [{ メソッド: input }],
    });
    const endpoints = data.endpoints as Array<Record<string, unknown>>;
    expect(endpoints[0]!.method).toBe(expected);
  });

  it('keeps endpoint path and summary strings verbatim', () => {
    const { data } = normalizeApiSpecFrontmatter({
      エンドポイント: [{ パス: '/users/{id}', 概要: 'GET は取得' }],
    });
    const endpoints = data.endpoints as Array<Record<string, unknown>>;
    expect(endpoints[0]!.path).toBe('/users/{id}');
    expect(endpoints[0]!.summary).toBe('GET は取得');
  });
});

describe('normalizeApiSpecFrontmatter — request / body / field scope', () => {
  it('translates request params, body fields, and field types', () => {
    const { data } = normalizeApiSpecFrontmatter({
      エンドポイント: [
        {
          オペレーションID: 'createUser',
          メソッド: 'post',
          パス: '/users',
          リクエスト: {
            クエリパラメータ: [{ 名前: 'dryRun', 型: '真偽値', 必須: false }],
            ボディ: {
              コンテンツタイプ: 'application/json',
              フィールド: [
                { 名前: 'email', 型: '文字列', 必須: true, フォーマット: 'email' },
                {
                  名前: 'address',
                  型: 'オブジェクト',
                  要素: [{ 名前: 'zip', 型: '文字列' }],
                },
              ],
            },
          },
          レスポンス: [{ ステータス: 201, 説明: '作成完了' }],
        },
      ],
    });
    const endpoints = data.endpoints as Array<Record<string, unknown>>;
    expect(endpoints[0]!.request).toEqual({
      queryParams: [{ name: 'dryRun', type: 'boolean', required: false }],
      body: {
        contentType: 'application/json',
        fields: [
          { name: 'email', type: 'string', required: true, format: 'email' },
          { name: 'address', type: 'object', of: [{ name: 'zip', type: 'string' }] },
        ],
      },
    });
    expect(endpoints[0]!.responses).toEqual([{ status: 201, description: '作成完了' }]);
  });

  it('keeps dbRef verbatim and translates response body', () => {
    const { data } = normalizeApiSpecFrontmatter({
      エンドポイント: [
        {
          オペレーションID: 'getUser',
          メソッド: 'GET',
          パス: '/users/{id}',
          レスポンス: [
            {
              ステータス: 200,
              ボディ: {
                コンテンツタイプ: 'application/json',
                フィールド: [{ 名前: 'id', 型: '文字列', DB参照: 'DB-2026-001#users.id' }],
              },
            },
            { ステータス: 404, エラー参照: 'NOT_FOUND' },
          ],
        },
      ],
    });
    const endpoints = data.endpoints as Array<Record<string, unknown>>;
    const responses = endpoints[0]!.responses as Array<Record<string, unknown>>;
    const body = responses[0]!.body as Record<string, unknown>;
    expect(body.fields).toEqual([{ name: 'id', type: 'string', dbRef: 'DB-2026-001#users.id' }]);
    expect(responses[1]).toEqual({ status: 404, errorRef: 'NOT_FOUND' });
  });
});

describe('normalizeApiSpecFrontmatter — error scope', () => {
  it('translates error catalog entries', () => {
    const { data } = normalizeApiSpecFrontmatter({
      エラー: [{ コード: 'NOT_FOUND', HTTPステータス: 404, メッセージ: '見つかりません' }],
    });
    expect(data.errors).toEqual([
      { code: 'NOT_FOUND', httpStatus: 404, message: '見つかりません' },
    ]);
  });
});

describe('normalizeApiSpecFrontmatter — party scope', () => {
  it('translates author/reviewer names and roles', () => {
    const { data } = normalizeApiSpecFrontmatter({
      作成者: [
        { 名前: '田中', 役割: '設計担当' },
        { 氏名: '鈴木', 役職: 'API 担当' },
      ],
      レビュアー: [{ 名称: '佐藤', 肩書き: 'PM' }],
    });
    expect(data.authors).toEqual([
      { name: '田中', role: '設計担当' },
      { name: '鈴木', role: 'API 担当' },
    ]);
    expect(data.reviewers).toEqual([{ name: '佐藤', role: 'PM' }]);
  });
});

describe('normalizeApiSpecFrontmatter — warnings', () => {
  it('warns when two source keys collapse to the same target at root', () => {
    const { warnings } = normalizeApiSpecFrontmatter({ タイトル: 'A', 表題: 'B' });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.path).toBe('title');
  });

  it('reports nested collision paths inside endpoint body fields', () => {
    const { warnings } = normalizeApiSpecFrontmatter({
      エンドポイント: [
        {
          オペレーションID: 'x',
          リクエスト: {
            ボディ: {
              コンテンツタイプ: 'application/json',
              フィールド: [{ 名前: 'id', フィールド名: 'id2' }],
            },
          },
        },
      ],
    });
    expect(
      warnings.some((w) => w.path === 'endpoints[0].request.body.fields[0].name'),
    ).toBe(true);
  });
});

describe('normalizeApiSpecFrontmatter — pass-through unknown keys', () => {
  it('keeps unknown root keys verbatim for Ajv to surface', () => {
    const { data } = normalizeApiSpecFrontmatter({ 不明: 'x', タイトル: 't' });
    expect(data).toMatchObject({ 不明: 'x', title: 't' });
  });
});
