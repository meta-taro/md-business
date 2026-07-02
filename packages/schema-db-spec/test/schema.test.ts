import { describe, it, expect } from 'vitest';
import { parseAndValidate } from '@md-business/core/runtime';
import { dbSpecSchema, SCHEMA_VERSION } from '../src/index.js';
import type { DbSpec } from '../src/index.js';

function buildDbSpec(): Record<string, unknown> {
  return {
    schema: 'db-spec/v1',
    documentNumber: 'DB-2026-001',
    title: '受発注ワークフロー DB 設計',
    version: '0.1.0',
    issueDate: '2026-06-26',
    status: 'draft',
    engine: 'postgres',
    authors: [{ name: '田中', role: '設計担当' }],
    tables: [
      {
        name: 'users',
        description: '利用者マスター',
        columns: [
          { name: 'id', type: 'bigserial', pk: true },
          { name: 'email', type: 'varchar(255)', nullable: false, unique: true },
          {
            name: 'tenant_id',
            type: 'bigint',
            nullable: false,
            fk: { table: 'tenants', column: 'id', onDelete: 'restrict' },
          },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
        indexes: [{ name: 'ix_users_tenant_email', columns: ['tenant_id', 'email'], unique: true }],
        triggers: [
          { name: 'trg_users_updated_at', on: 'BEFORE UPDATE', action: 'set updated_at = now()' },
        ],
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

describe('dbSpecSchema constants', () => {
  it('exports the schema as an object', () => {
    expect(typeof dbSpecSchema).toBe('object');
  });

  it('exposes SCHEMA_VERSION constant', () => {
    expect(SCHEMA_VERSION).toBe('db-spec/v1');
  });
});

describe('dbSpecSchema — happy path', () => {
  it('validates a minimal complete db-spec', () => {
    const result = parseAndValidate<DbSpec>(toFrontmatter(buildDbSpec()), dbSpecSchema);
    expect(result.ok).toBe(true);
  });

  it('accepts optional charset, collation, reviewers, relatedDocs, migrations, theme, fileName', () => {
    const data = {
      ...buildDbSpec(),
      charset: 'UTF8',
      collation: 'ja_JP.UTF-8',
      reviewers: [{ name: '山田', role: 'PM' }],
      relatedDocs: ['./../spec/order-system.md'],
      migrations: [
        { id: '20260601_init', description: '初期スキーマ' },
        { id: '20260615_add_tenants' },
      ],
      theme: '緑',
      fileName: 'DB設計書_{documentNumber}_v{version}',
    };
    const result = parseAndValidate<DbSpec>(toFrontmatter(data), dbSpecSchema);
    expect(result.ok).toBe(true);
  });

  it.each(['postgres', 'mysql', 'aurora', 'sqlite', 'neon', 'supabase', 'turso', 'cloudsql'])(
    'accepts engine %s',
    (engine) => {
      const data = { ...buildDbSpec(), engine };
      const result = parseAndValidate<DbSpec>(toFrontmatter(data), dbSpecSchema);
      expect(result.ok).toBe(true);
    },
  );

  it.each(['draft', 'review', 'approved', 'deprecated'])('accepts status %s', (status) => {
    const data = { ...buildDbSpec(), status };
    const result = parseAndValidate<DbSpec>(toFrontmatter(data), dbSpecSchema);
    expect(result.ok).toBe(true);
  });

  it.each(['btree', 'gin', 'gist', 'hash', 'brin'])('accepts index using %s', (using) => {
    const data = buildDbSpec();
    const tables = data.tables as Array<Record<string, unknown>>;
    tables[0]!.indexes = [{ name: 'ix_x', columns: ['email'], using }];
    const result = parseAndValidate<DbSpec>(toFrontmatter(data), dbSpecSchema);
    expect(result.ok).toBe(true);
  });

  it.each([['now()'], [0], [true]])('accepts column default literal %j', (defaultValue) => {
    const data = buildDbSpec();
    const tables = data.tables as Array<Record<string, unknown>>;
    tables[0]!.columns = [{ name: 'flag', type: 'boolean', default: defaultValue }];
    const result = parseAndValidate<DbSpec>(toFrontmatter(data), dbSpecSchema);
    expect(result.ok).toBe(true);
  });

  it('accepts fk with onUpdate', () => {
    const data = buildDbSpec();
    const tables = data.tables as Array<Record<string, unknown>>;
    tables[0]!.columns = [
      {
        name: 'user_id',
        type: 'bigint',
        fk: { table: 'users', column: 'id', onDelete: 'cascade', onUpdate: 'no_action' },
      },
    ];
    const result = parseAndValidate<DbSpec>(toFrontmatter(data), dbSpecSchema);
    expect(result.ok).toBe(true);
  });
});

describe('dbSpecSchema — error cases', () => {
  function expectInvalid(data: Record<string, unknown>): void {
    const result = parseAndValidate<DbSpec>(toFrontmatter(data), dbSpecSchema);
    expect(result.ok).toBe(false);
  }

  it('rejects a wrong schema const', () => {
    expectInvalid({ ...buildDbSpec(), schema: 'db-spec/v2' });
  });

  it('rejects a non-SemVer version', () => {
    expectInvalid({ ...buildDbSpec(), version: '1.0' });
  });

  it('rejects a non-ISO issueDate', () => {
    expectInvalid({ ...buildDbSpec(), issueDate: '2026/06/26' });
  });

  it('rejects an unknown status', () => {
    expectInvalid({ ...buildDbSpec(), status: 'done' });
  });

  it('rejects an unknown engine', () => {
    expectInvalid({ ...buildDbSpec(), engine: 'oracle' });
  });

  it('rejects empty authors', () => {
    expectInvalid({ ...buildDbSpec(), authors: [] });
  });

  it('rejects empty tables', () => {
    expectInvalid({ ...buildDbSpec(), tables: [] });
  });

  it('rejects an empty documentNumber', () => {
    expectInvalid({ ...buildDbSpec(), documentNumber: '' });
  });

  it('rejects an unknown top-level key', () => {
    expectInvalid({ ...buildDbSpec(), sheets: true });
  });

  it('rejects a table without columns', () => {
    expectInvalid({ ...buildDbSpec(), tables: [{ name: 'users' }] });
  });

  it('rejects a table with empty columns', () => {
    expectInvalid({ ...buildDbSpec(), tables: [{ name: 'users', columns: [] }] });
  });

  it('rejects a column without type', () => {
    expectInvalid({ ...buildDbSpec(), tables: [{ name: 'users', columns: [{ name: 'id' }] }] });
  });

  it('rejects an unknown column key', () => {
    expectInvalid({
      ...buildDbSpec(),
      tables: [{ name: 'users', columns: [{ name: 'id', type: 'bigint', primary: true }] }],
    });
  });

  it('rejects fk without column', () => {
    expectInvalid({
      ...buildDbSpec(),
      tables: [
        { name: 'users', columns: [{ name: 'tenant_id', type: 'bigint', fk: { table: 'tenants' } }] },
      ],
    });
  });

  it('rejects fk with unknown onDelete', () => {
    expectInvalid({
      ...buildDbSpec(),
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'tenant_id', type: 'bigint', fk: { table: 'tenants', column: 'id', onDelete: 'nullify' } },
          ],
        },
      ],
    });
  });

  it('rejects an index without columns', () => {
    expectInvalid({
      ...buildDbSpec(),
      tables: [
        { name: 'users', columns: [{ name: 'id', type: 'bigint' }], indexes: [{ name: 'ix_x' }] },
      ],
    });
  });

  it('rejects an index with unknown using', () => {
    expectInvalid({
      ...buildDbSpec(),
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'bigint' }],
          indexes: [{ name: 'ix_x', columns: ['id'], using: 'rtree' }],
        },
      ],
    });
  });

  it('rejects a trigger without action', () => {
    expectInvalid({
      ...buildDbSpec(),
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'bigint' }],
          triggers: [{ name: 'trg_x', on: 'BEFORE UPDATE' }],
        },
      ],
    });
  });

  it('rejects a migration without id', () => {
    expectInvalid({ ...buildDbSpec(), migrations: [{ description: '初期スキーマ' }] });
  });
});
