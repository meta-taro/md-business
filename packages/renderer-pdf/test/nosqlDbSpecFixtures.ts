import type { NosqlDbSpec } from '@md-business/schema-nosql-db-spec';

/**
 * A Firestore-flavoured NoSQL design doc exercising the full renderer surface:
 * nested `map` / `array<map>` shapes, indexes, TTL, composite subcollection
 * paths, reviewers, related docs, and security rules.
 */
export function standardNosqlDbSpec(overrides: Partial<NosqlDbSpec> = {}): NosqlDbSpec {
  return {
    schema: 'nosql-db-spec/v1',
    documentNumber: 'NDB-2026-0001',
    title: '受発注システム NoSQL 設計書',
    version: '1.0.0',
    issueDate: '2026-06-17',
    status: 'review',
    engine: 'firestore',
    multiRegion: 'nam5',
    authors: [
      { name: '田中 雅友', role: 'PdM' },
      { name: '山田 花子', role: 'テックリード' },
    ],
    reviewers: [{ name: '佐藤 太郎', role: '部長' }],
    relatedDocs: ['/docs/requirements.md', '/docs/architecture.md'],
    theme: 'blue',
    collections: [
      {
        path: 'users',
        description: 'ユーザードキュメント',
        docIdStrategy: 'auth-uid',
        shape: {
          displayName: { type: 'string', required: true, description: '表示名' },
          email: { type: 'string', required: true },
          role: { type: 'string', enum: ['admin', 'member'], default: 'member' },
          profile: {
            type: 'map',
            description: 'プロフィール',
            shape: {
              bio: { type: 'string' },
              address: {
                type: 'map',
                shape: {
                  city: { type: 'string' },
                  zip: { type: 'string' },
                },
              },
            },
          },
          createdAt: { type: 'timestamp', required: true },
        },
        indexes: [{ fields: ['email'], scope: 'collection', mode: 'ASCENDING' }],
        ttl: { field: 'expireAt', enabled: false },
      },
      {
        path: 'users/{userId}/orders',
        description: '注文サブコレクション',
        docIdStrategy: 'composite',
        partitionKeyField: 'userId',
        sortKeyField: 'createdAt',
        shape: {
          total: { type: 'number', required: true, default: 0 },
          items: {
            type: 'array',
            description: '明細',
            of: {
              type: 'map',
              shape: {
                sku: { type: 'string', required: true },
                qty: { type: 'number', required: true, default: 1 },
              },
            },
          },
          tags: { type: 'array', of: { type: 'string' } },
        },
        indexes: [{ fields: ['createdAt'], mode: 'DESCENDING' }],
      },
    ],
    securityRules: [
      { match: '/users/{uid}', allow: ['read'], if: 'request.auth != null' },
      { match: '/users/{uid}', allow: ['write'], if: 'request.auth.uid == uid' },
    ],
    ...overrides,
  };
}

export function minimalNosqlDbSpec(overrides: Partial<NosqlDbSpec> = {}): NosqlDbSpec {
  return {
    schema: 'nosql-db-spec/v1',
    documentNumber: 'NDB-MIN-001',
    title: '最小 NoSQL 設計書',
    version: '0.1.0',
    issueDate: '2026-06-17',
    status: 'draft',
    engine: 'dynamodb',
    authors: [{ name: '担当者' }],
    collections: [
      {
        path: 'sessions',
        docIdStrategy: 'composite',
        partitionKeyField: 'pk',
        sortKeyField: 'sk',
        shape: {
          pk: { type: 'string', required: true },
          sk: { type: 'string', required: true },
        },
      },
    ],
    ...overrides,
  };
}
