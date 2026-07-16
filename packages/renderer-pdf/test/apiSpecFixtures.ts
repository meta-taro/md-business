import type { ApiSpec } from '@md-business/schema-api-spec';

/**
 * A REST API design doc exercising the full renderer surface: multiple
 * endpoints (GET / POST), path / query / header params, request + response
 * bodies with nested `array<object>` fields (`of[]`), per-endpoint auth
 * override, tags, a deprecated endpoint, errorRef wiring, reviewers, related
 * docs, and an error catalog.
 */
export function standardApiSpec(overrides: Partial<ApiSpec> = {}): ApiSpec {
  return {
    schema: 'api-spec/v1',
    documentNumber: 'API-2026-0001',
    title: '受発注システム API 設計書',
    version: '1.0.0',
    issueDate: '2026-06-17',
    status: 'review',
    protocol: 'rest',
    auth: 'bearer',
    baseUrl: 'https://api.example.com/v1',
    authors: [
      { name: '田中 雅友', role: 'PdM' },
      { name: '山田 花子', role: 'テックリード' },
    ],
    reviewers: [{ name: '佐藤 太郎', role: '部長' }],
    relatedDocs: ['/docs/requirements.md', '/docs/architecture.md'],
    theme: 'blue',
    endpoints: [
      {
        operationId: 'listOrders',
        method: 'GET',
        path: '/orders',
        summary: '注文一覧を取得する',
        tags: ['orders', 'read'],
        request: {
          queryParams: [
            { name: 'page', type: 'integer', description: 'ページ番号', format: 'int32' },
            { name: 'status', type: 'string', description: '絞り込みステータス' },
          ],
          headers: [{ name: 'X-Request-Id', type: 'string' }],
        },
        responses: [
          {
            status: 200,
            description: '注文の配列',
            body: {
              contentType: 'application/json',
              fields: [
                {
                  name: 'items',
                  type: 'array',
                  required: true,
                  description: '注文明細',
                  of: [
                    {
                      name: 'id',
                      type: 'string',
                      required: true,
                      dbRef: 'orders.id',
                    },
                    { name: 'total', type: 'number', required: true },
                  ],
                },
                { name: 'nextPage', type: 'integer' },
              ],
            },
          },
          { status: 401, description: '認証エラー', errorRef: 'UNAUTHORIZED' },
        ],
      },
      {
        operationId: 'createOrder',
        method: 'POST',
        path: '/orders',
        summary: '注文を作成する',
        tags: ['orders'],
        auth: 'oauth2',
        request: {
          body: {
            contentType: 'application/json',
            fields: [
              { name: 'sku', type: 'string', required: true, dbRef: 'products.sku' },
              { name: 'qty', type: 'integer', required: true },
            ],
          },
        },
        responses: [
          { status: 201, description: '作成された注文' },
          { status: 422, errorRef: 'VALIDATION_FAILED' },
        ],
      },
      {
        operationId: 'getOrder',
        method: 'GET',
        path: '/orders/{orderId}',
        summary: '注文を1件取得する（旧仕様）',
        deprecated: true,
        request: {
          pathParams: [{ name: 'orderId', type: 'string', required: true }],
        },
        responses: [{ status: 200, description: '注文' }],
      },
    ],
    errors: [
      { code: 'UNAUTHORIZED', httpStatus: 401, message: '認証に失敗しました' },
      { code: 'VALIDATION_FAILED', httpStatus: 422, message: '入力値が不正です' },
    ],
    ...overrides,
  };
}

/**
 * A minimal RPC API doc with a single endpoint and no optional sections
 * (no baseUrl / reviewers / relatedDocs / errors / request).
 */
export function minimalApiSpec(overrides: Partial<ApiSpec> = {}): ApiSpec {
  return {
    schema: 'api-spec/v1',
    documentNumber: 'API-MIN-001',
    title: '最小 API 設計書',
    version: '0.1.0',
    issueDate: '2026-06-17',
    status: 'draft',
    protocol: 'rpc',
    auth: 'none',
    authors: [{ name: '担当者' }],
    endpoints: [
      {
        operationId: 'ping',
        method: 'POST',
        path: '/rpc/ping',
        responses: [{ status: 200 }],
      },
    ],
    ...overrides,
  };
}
