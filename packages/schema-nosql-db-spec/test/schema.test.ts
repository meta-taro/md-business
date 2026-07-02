import { describe, it, expect } from 'vitest';
import { parseAndValidate } from '@md-business/core/runtime';
import { nosqlDbSpecSchema, SCHEMA_VERSION } from '../src/index.js';
import type { NosqlDbSpec } from '../src/index.js';

function buildNosqlDbSpec(): Record<string, unknown> {
  return {
    schema: 'nosql-db-spec/v1',
    documentNumber: 'NOSQL-2026-001',
    title: '受発注ワークフロー Firestore 設計',
    version: '0.1.0',
    issueDate: '2026-06-26',
    status: 'draft',
    engine: 'firestore',
    authors: [{ name: '田中', role: '設計担当' }],
    collections: [
      {
        path: 'users',
        description: '利用者ドキュメント',
        docIdStrategy: 'auth-uid',
        shape: {
          uid: { type: 'string', required: true },
          email: { type: 'string', required: true },
          tenantId: { type: 'string', required: true },
          createdAt: { type: 'timestamp', required: true, default: 'serverTimestamp' },
        },
        indexes: [{ fields: ['tenantId', 'email'], scope: 'collection', mode: 'ASCENDING' }],
      },
    ],
  };
}

function toFrontmatter(data: Record<string, unknown>): string {
  const yaml = Object.entries(data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n`;
}

describe('nosqlDbSpecSchema constants', () => {
  it('exports the schema as an object', () => {
    expect(typeof nosqlDbSpecSchema).toBe('object');
  });

  it('exposes SCHEMA_VERSION constant', () => {
    expect(SCHEMA_VERSION).toBe('nosql-db-spec/v1');
  });
});

describe('nosqlDbSpecSchema — happy path', () => {
  it('validates a minimal complete nosql-db-spec', () => {
    const result = parseAndValidate<NosqlDbSpec>(toFrontmatter(buildNosqlDbSpec()), nosqlDbSpecSchema);
    expect(result.ok).toBe(true);
  });

  it('accepts optional multiRegion, reviewers, relatedDocs, securityRules, theme, fileName', () => {
    const data = {
      ...buildNosqlDbSpec(),
      multiRegion: 'nam5',
      reviewers: [{ name: '山田', role: 'PM' }],
      relatedDocs: ['./../spec/order-system.md'],
      securityRules: [
        { match: '/users/{userId}', allow: ['read', 'write'], if: 'request.auth.uid == userId' },
      ],
      theme: '紫',
      fileName: 'NoSQL設計書_{documentNumber}_v{version}',
    };
    const result = parseAndValidate<NosqlDbSpec>(toFrontmatter(data), nosqlDbSpecSchema);
    expect(result.ok).toBe(true);
  });

  it.each(['firestore', 'dynamodb', 'mongodb', 'cosmosdb', 'redis', 'documentdb', 'turso-document'])(
    'accepts engine %s',
    (engine) => {
      const data = { ...buildNosqlDbSpec(), engine };
      const result = parseAndValidate<NosqlDbSpec>(toFrontmatter(data), nosqlDbSpecSchema);
      expect(result.ok).toBe(true);
    },
  );

  it('accepts a subcollection with recursive array-of-map shape and ttl', () => {
    const data = buildNosqlDbSpec();
    (data.collections as unknown[]).push({
      path: 'users/{userId}/orders',
      description: 'ユーザーごとの受注（サブコレクション）',
      docIdStrategy: 'auto',
      shape: {
        total: { type: 'number', required: true },
        currency: { type: 'string', required: true, enum: ['JPY', 'USD', 'EUR'] },
        items: {
          type: 'array',
          of: {
            type: 'map',
            shape: {
              sku: { type: 'string', required: true },
              quantity: { type: 'number', required: true },
              price: { type: 'number', required: true },
            },
          },
        },
        createdAt: { type: 'timestamp', required: true, default: 'serverTimestamp' },
      },
      indexes: [{ fields: ['createdAt'], scope: 'collection', mode: 'DESCENDING' }],
      ttl: { field: 'expiresAt', enabled: false },
    });
    const result = parseAndValidate<NosqlDbSpec>(toFrontmatter(data), nosqlDbSpecSchema);
    expect(result.ok).toBe(true);
  });

  it('accepts docIdStrategy composite with partitionKeyField / sortKeyField (DynamoDB)', () => {
    const data = {
      ...buildNosqlDbSpec(),
      engine: 'dynamodb',
      collections: [
        {
          path: 'orders',
          docIdStrategy: 'composite',
          partitionKeyField: 'tenantId',
          sortKeyField: 'createdAt',
          shape: {
            tenantId: { type: 'string', required: true },
            createdAt: { type: 'string', required: true },
          },
        },
      ],
    };
    const result = parseAndValidate<NosqlDbSpec>(toFrontmatter(data), nosqlDbSpecSchema);
    expect(result.ok).toBe(true);
  });

  it('accepts an engineSpecific escape hatch object', () => {
    const data = buildNosqlDbSpec();
    const collections = data.collections as Array<Record<string, unknown>>;
    collections[0]!.engineSpecific = { billingMode: 'PAY_PER_REQUEST', streamEnabled: true };
    const result = parseAndValidate<NosqlDbSpec>(toFrontmatter(data), nosqlDbSpecSchema);
    expect(result.ok).toBe(true);
  });
});

describe('nosqlDbSpecSchema — error cases', () => {
  function expectInvalid(data: Record<string, unknown>): void {
    const result = parseAndValidate<NosqlDbSpec>(toFrontmatter(data), nosqlDbSpecSchema);
    expect(result.ok).toBe(false);
  }

  it('rejects a wrong schema const', () => {
    expectInvalid({ ...buildNosqlDbSpec(), schema: 'nosql-db-spec/v2' });
  });

  it('rejects a non-SemVer version', () => {
    expectInvalid({ ...buildNosqlDbSpec(), version: '1.0' });
  });

  it('rejects a non-ISO issueDate', () => {
    expectInvalid({ ...buildNosqlDbSpec(), issueDate: '2026/06/26' });
  });

  it('rejects an unknown status', () => {
    expectInvalid({ ...buildNosqlDbSpec(), status: 'done' });
  });

  it('rejects an unknown engine', () => {
    expectInvalid({ ...buildNosqlDbSpec(), engine: 'couchdb' });
  });

  it('rejects empty authors', () => {
    expectInvalid({ ...buildNosqlDbSpec(), authors: [] });
  });

  it('rejects empty collections', () => {
    expectInvalid({ ...buildNosqlDbSpec(), collections: [] });
  });

  it('rejects an unknown top-level key', () => {
    expectInvalid({ ...buildNosqlDbSpec(), tables: [] });
  });

  it('rejects a collection without path', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [{ docIdStrategy: 'auto', shape: { uid: { type: 'string' } } }],
    });
  });

  it('rejects a collection without docIdStrategy', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [{ path: 'users', shape: { uid: { type: 'string' } } }],
    });
  });

  it('rejects an unknown docIdStrategy', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [{ path: 'users', docIdStrategy: 'slug', shape: { uid: { type: 'string' } } }],
    });
  });

  it('rejects docIdStrategy composite without partitionKeyField', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [
        { path: 'orders', docIdStrategy: 'composite', shape: { tenantId: { type: 'string' } } },
      ],
    });
  });

  it('rejects an empty shape', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [{ path: 'users', docIdStrategy: 'auto', shape: {} }],
    });
  });

  it('rejects a shape field with unknown type', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [{ path: 'users', docIdStrategy: 'auto', shape: { total: { type: 'float' } } }],
    });
  });

  it('rejects type array without of', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [{ path: 'users', docIdStrategy: 'auto', shape: { items: { type: 'array' } } }],
    });
  });

  it('rejects type map without shape', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [{ path: 'users', docIdStrategy: 'auto', shape: { meta: { type: 'map' } } }],
    });
  });

  it('rejects an index without fields', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [
        {
          path: 'users',
          docIdStrategy: 'auto',
          shape: { uid: { type: 'string' } },
          indexes: [{ scope: 'collection' }],
        },
      ],
    });
  });

  it('rejects an index with unknown scope', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [
        {
          path: 'users',
          docIdStrategy: 'auto',
          shape: { uid: { type: 'string' } },
          indexes: [{ fields: ['uid'], scope: 'global' }],
        },
      ],
    });
  });

  it('rejects ttl without field', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      collections: [
        {
          path: 'users',
          docIdStrategy: 'auto',
          shape: { uid: { type: 'string' } },
          ttl: { enabled: true },
        },
      ],
    });
  });

  it('rejects a securityRule without match', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      securityRules: [{ allow: ['read'] }],
    });
  });

  it('rejects a securityRule with unknown allow value', () => {
    expectInvalid({
      ...buildNosqlDbSpec(),
      securityRules: [{ match: '/users/{userId}', allow: ['admin'] }],
    });
  });
});
