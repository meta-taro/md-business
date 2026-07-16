import { describe, it, expect } from 'vitest';
import { parseAndValidate } from '@md-business/core/runtime';
import { apiSpecSchema, SCHEMA_VERSION } from '../src/index.js';
import type { ApiSpec } from '../src/index.js';

function buildApiSpec(): Record<string, unknown> {
  return {
    schema: 'api-spec/v1',
    documentNumber: 'API-2026-001',
    title: '受発注 API 詳細設計',
    version: '0.1.0',
    issueDate: '2026-07-15',
    status: 'draft',
    protocol: 'rest',
    auth: 'bearer',
    baseUrl: 'https://api.example.com/v1',
    authors: [{ name: '田中', role: '設計担当' }],
    endpoints: [
      {
        operationId: 'listUsers',
        method: 'GET',
        path: '/users',
        summary: '利用者一覧を取得する',
        tags: ['users'],
        request: {
          queryParams: [
            { name: 'limit', type: 'integer', required: false, description: '取得件数上限' },
            { name: 'cursor', type: 'string', required: false },
          ],
        },
        responses: [
          {
            status: 200,
            description: '成功',
            body: {
              contentType: 'application/json',
              fields: [
                {
                  name: 'items',
                  type: 'array',
                  required: true,
                  of: [
                    { name: 'id', type: 'string', required: true, dbRef: 'DB-2026-001#users.id' },
                    { name: 'email', type: 'string', required: true, format: 'email' },
                  ],
                },
              ],
            },
          },
          { status: 401, errorRef: 'UNAUTHORIZED' },
        ],
      },
    ],
    errors: [{ code: 'UNAUTHORIZED', httpStatus: 401, message: '認証が必要です' }],
  };
}

function toFrontmatter(data: Record<string, unknown>): string {
  const yaml = Object.entries(data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n`;
}

describe('apiSpecSchema constants', () => {
  it('exports the schema as an object', () => {
    expect(typeof apiSpecSchema).toBe('object');
  });

  it('exposes SCHEMA_VERSION constant', () => {
    expect(SCHEMA_VERSION).toBe('api-spec/v1');
  });
});

describe('apiSpecSchema — happy path', () => {
  it('validates a minimal complete api-spec', () => {
    const result = parseAndValidate<ApiSpec>(toFrontmatter(buildApiSpec()), apiSpecSchema);
    expect(result.ok).toBe(true);
  });

  it('accepts optional reviewers, relatedDocs, theme, fileName, endpoint auth override + deprecated', () => {
    const data = {
      ...buildApiSpec(),
      reviewers: [{ name: '山田', role: 'PM' }],
      relatedDocs: ['./../db-spec/order-db.md'],
      theme: '青',
      fileName: 'API設計書_{documentNumber}_v{version}',
      endpoints: [
        {
          operationId: 'deleteUser',
          method: 'DELETE',
          path: '/users/{id}',
          auth: 'oauth2',
          deprecated: true,
          request: { pathParams: [{ name: 'id', type: 'string', required: true }] },
          responses: [{ status: 204 }],
        },
      ],
    };
    const result = parseAndValidate<ApiSpec>(toFrontmatter(data), apiSpecSchema);
    expect(result.ok).toBe(true);
  });

  it.each(['rest', 'rpc', 'graphql'])('accepts protocol %s', (protocol) => {
    const result = parseAndValidate<ApiSpec>(
      toFrontmatter({ ...buildApiSpec(), protocol }),
      apiSpecSchema,
    );
    expect(result.ok).toBe(true);
  });

  it.each(['none', 'bearer', 'apiKey', 'oauth2', 'basic'])('accepts auth %s', (auth) => {
    const result = parseAndValidate<ApiSpec>(
      toFrontmatter({ ...buildApiSpec(), auth }),
      apiSpecSchema,
    );
    expect(result.ok).toBe(true);
  });

  it.each(['draft', 'review', 'approved', 'deprecated'])('accepts status %s', (status) => {
    const result = parseAndValidate<ApiSpec>(
      toFrontmatter({ ...buildApiSpec(), status }),
      apiSpecSchema,
    );
    expect(result.ok).toBe(true);
  });

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])(
    'accepts method %s',
    (method) => {
      const data = buildApiSpec();
      const endpoints = data.endpoints as Array<Record<string, unknown>>;
      endpoints[0]!.method = method;
      const result = parseAndValidate<ApiSpec>(toFrontmatter(data), apiSpecSchema);
      expect(result.ok).toBe(true);
    },
  );

  it.each(['string', 'integer', 'number', 'boolean', 'array', 'object', 'date', 'datetime'])(
    'accepts field type %s',
    (type) => {
      const data = buildApiSpec();
      const endpoints = data.endpoints as Array<Record<string, unknown>>;
      endpoints[0]!.request = { queryParams: [{ name: 'x', type }] };
      const result = parseAndValidate<ApiSpec>(toFrontmatter(data), apiSpecSchema);
      expect(result.ok).toBe(true);
    },
  );

  it('accepts a request body with fields and one-level nested object', () => {
    const data = buildApiSpec();
    const endpoints = data.endpoints as Array<Record<string, unknown>>;
    endpoints[0]!.method = 'POST';
    endpoints[0]!.request = {
      body: {
        contentType: 'application/json',
        fields: [
          {
            name: 'address',
            type: 'object',
            required: true,
            of: [
              { name: 'zip', type: 'string', required: true },
              { name: 'city', type: 'string' },
            ],
          },
        ],
      },
    };
    const result = parseAndValidate<ApiSpec>(toFrontmatter(data), apiSpecSchema);
    expect(result.ok).toBe(true);
  });
});

describe('apiSpecSchema — error cases', () => {
  function expectInvalid(data: Record<string, unknown>): void {
    const result = parseAndValidate<ApiSpec>(toFrontmatter(data), apiSpecSchema);
    expect(result.ok).toBe(false);
  }

  it('rejects a wrong schema const', () => {
    expectInvalid({ ...buildApiSpec(), schema: 'api-spec/v2' });
  });

  it('rejects a non-SemVer version', () => {
    expectInvalid({ ...buildApiSpec(), version: '1.0' });
  });

  it('rejects a non-ISO issueDate', () => {
    expectInvalid({ ...buildApiSpec(), issueDate: '2026/07/15' });
  });

  it('rejects an unknown status', () => {
    expectInvalid({ ...buildApiSpec(), status: 'done' });
  });

  it('rejects an unknown protocol', () => {
    expectInvalid({ ...buildApiSpec(), protocol: 'soap' });
  });

  it('rejects an unknown auth scheme', () => {
    expectInvalid({ ...buildApiSpec(), auth: 'jwt' });
  });

  it('rejects empty authors', () => {
    expectInvalid({ ...buildApiSpec(), authors: [] });
  });

  it('rejects empty endpoints', () => {
    expectInvalid({ ...buildApiSpec(), endpoints: [] });
  });

  it('rejects an empty documentNumber', () => {
    expectInvalid({ ...buildApiSpec(), documentNumber: '' });
  });

  it('rejects an unknown top-level key', () => {
    expectInvalid({ ...buildApiSpec(), sheets: true });
  });

  it('rejects an endpoint without responses', () => {
    expectInvalid({
      ...buildApiSpec(),
      endpoints: [{ operationId: 'x', method: 'GET', path: '/x' }],
    });
  });

  it('rejects an endpoint with empty responses', () => {
    expectInvalid({
      ...buildApiSpec(),
      endpoints: [{ operationId: 'x', method: 'GET', path: '/x', responses: [] }],
    });
  });

  it('rejects an unknown HTTP method', () => {
    expectInvalid({
      ...buildApiSpec(),
      endpoints: [{ operationId: 'x', method: 'TRACE', path: '/x', responses: [{ status: 200 }] }],
    });
  });

  it('rejects an endpoint without operationId', () => {
    expectInvalid({
      ...buildApiSpec(),
      endpoints: [{ method: 'GET', path: '/x', responses: [{ status: 200 }] }],
    });
  });

  it('rejects a field with an unknown type', () => {
    expectInvalid({
      ...buildApiSpec(),
      endpoints: [
        {
          operationId: 'x',
          method: 'GET',
          path: '/x',
          request: { queryParams: [{ name: 'q', type: 'uuid' }] },
          responses: [{ status: 200 }],
        },
      ],
    });
  });

  it('rejects an unknown field key', () => {
    expectInvalid({
      ...buildApiSpec(),
      endpoints: [
        {
          operationId: 'x',
          method: 'GET',
          path: '/x',
          request: { queryParams: [{ name: 'q', type: 'string', nullable: true }] },
          responses: [{ status: 200 }],
        },
      ],
    });
  });

  it('rejects a dbRef without a # separator', () => {
    expectInvalid({
      ...buildApiSpec(),
      endpoints: [
        {
          operationId: 'x',
          method: 'GET',
          path: '/x',
          request: { queryParams: [{ name: 'id', type: 'string', dbRef: 'users.id' }] },
          responses: [{ status: 200 }],
        },
      ],
    });
  });

  it('rejects a response with an out-of-range status', () => {
    expectInvalid({
      ...buildApiSpec(),
      endpoints: [
        { operationId: 'x', method: 'GET', path: '/x', responses: [{ status: 999 }] },
      ],
    });
  });

  it('rejects a body without contentType', () => {
    expectInvalid({
      ...buildApiSpec(),
      endpoints: [
        {
          operationId: 'x',
          method: 'POST',
          path: '/x',
          request: { body: { fields: [{ name: 'a', type: 'string' }] } },
          responses: [{ status: 200 }],
        },
      ],
    });
  });

  it('rejects an error entry without httpStatus', () => {
    expectInvalid({
      ...buildApiSpec(),
      errors: [{ code: 'X', message: 'boom' }],
    });
  });
});
