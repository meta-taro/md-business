import type { DbSpec } from '@md-business/schema-db-spec';

export function standardDbSpec(overrides: Partial<DbSpec> = {}): DbSpec {
  return {
    schema: 'db-spec/v1',
    documentNumber: 'DB-2026-0001',
    title: '受発注システム DB 設計書',
    version: '1.0.0',
    issueDate: '2026-06-17',
    status: 'review',
    engine: 'postgres',
    charset: 'UTF8',
    collation: 'ja_JP.UTF-8',
    authors: [
      { name: '伊藤 太郎', role: 'PdM' },
      { name: '山田 花子', role: 'テックリード' },
    ],
    reviewers: [{ name: '佐藤 太郎', role: '部長' }],
    relatedDocs: ['/docs/requirements.md', '/docs/architecture.md'],
    theme: 'blue',
    tables: [
      {
        name: 'orders',
        description: '注文ヘッダ',
        columns: [
          { name: 'id', type: 'bigserial', pk: true, nullable: false },
          { name: 'customer_id', type: 'bigint', nullable: false, fk: { table: 'customers', column: 'id', onDelete: 'restrict' } },
          { name: 'status', type: 'varchar(20)', nullable: false, default: "'pending'" },
          { name: 'total', type: 'numeric(12,2)', nullable: false, default: 0 },
          { name: 'note', type: 'text' },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
        indexes: [
          { name: 'idx_orders_customer', columns: ['customer_id'], using: 'btree' },
          { name: 'uq_orders_number', columns: ['order_number'], unique: true },
        ],
        triggers: [
          { name: 'trg_orders_updated', on: 'BEFORE UPDATE', action: 'set_updated_at()' },
        ],
      },
      {
        name: 'order_items',
        columns: [
          { name: 'id', type: 'bigserial', pk: true, nullable: false },
          { name: 'order_id', type: 'bigint', nullable: false, fk: { table: 'orders', column: 'id', onDelete: 'cascade', onUpdate: 'cascade' } },
          { name: 'quantity', type: 'integer', nullable: false, default: 1 },
        ],
      },
    ],
    migrations: [
      { id: '20260601000000_init', description: '初期スキーマ' },
      { id: '20260610093015_add_orders_note' },
    ],
    ...overrides,
  };
}

export function minimalDbSpec(overrides: Partial<DbSpec> = {}): DbSpec {
  return {
    schema: 'db-spec/v1',
    documentNumber: 'DB-MIN-001',
    title: '最小 DB 設計書',
    version: '0.1.0',
    issueDate: '2026-06-17',
    status: 'draft',
    engine: 'sqlite',
    authors: [{ name: '担当者' }],
    tables: [
      {
        name: 'users',
        columns: [{ name: 'id', type: 'integer', pk: true }],
      },
    ],
    ...overrides,
  };
}
