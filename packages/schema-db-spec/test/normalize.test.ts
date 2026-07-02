import { describe, it, expect } from 'vitest';
import { normalizeDbSpecFrontmatter } from '../src/index.js';

describe('normalizeDbSpecFrontmatter — root scope', () => {
  it('returns empty data when given a non-object', () => {
    expect(normalizeDbSpecFrontmatter(null).data).toEqual({});
    expect(normalizeDbSpecFrontmatter('x').data).toEqual({});
    expect(normalizeDbSpecFrontmatter(42).data).toEqual({});
  });

  it('translates canonical Japanese root keys to English', () => {
    const { data, warnings } = normalizeDbSpecFrontmatter({
      スキーマ: 'db-spec/v1',
      文書番号: 'DB-2026-001',
      タイトル: '受発注ワークフロー DB 設計',
      版: '0.1.0',
      発行日: '2026-06-26',
      ステータス: 'ドラフト',
      エンジン: 'PostgreSQL',
      文字コード: 'UTF8',
      照合順序: 'ja_JP.UTF-8',
      作成者: [{ 名前: '田中', 役割: '設計担当' }],
      レビュアー: [{ 名前: '山田' }],
      関連文書: ['./../spec/order-system.md'],
      テーブル: [{ 名前: 'users', 列: [{ 名前: 'id', 型: 'bigserial' }] }],
      マイグレーション: [{ ID: '20260601_init', 説明: '初期スキーマ' }],
      テーマ: '青',
      ファイル名: 'DB設計書_{文書番号}_v{版}',
    });
    expect(warnings).toEqual([]);
    expect(data).toMatchObject({
      schema: 'db-spec/v1',
      documentNumber: 'DB-2026-001',
      title: '受発注ワークフロー DB 設計',
      version: '0.1.0',
      issueDate: '2026-06-26',
      status: 'draft',
      engine: 'postgres',
      charset: 'UTF8',
      collation: 'ja_JP.UTF-8',
      relatedDocs: ['./../spec/order-system.md'],
      theme: 'blue',
      fileName: 'DB設計書_{文書番号}_v{版}',
    });
    expect(data.authors).toEqual([{ name: '田中', role: '設計担当' }]);
    expect(data.reviewers).toEqual([{ name: '山田' }]);
    expect(data.tables).toEqual([
      { name: 'users', columns: [{ name: 'id', type: 'bigserial' }] },
    ]);
    expect(data.migrations).toEqual([{ id: '20260601_init', description: '初期スキーマ' }]);
  });

  it.each([['テーブル'], ['表'], ['tables']])('maps root key "%s" → tables', (key) => {
    const { data } = normalizeDbSpecFrontmatter({ [key]: [] });
    expect(data.tables).toEqual([]);
  });

  it.each([['マイグレーション'], ['移行履歴'], ['migrations']])(
    'maps root key "%s" → migrations',
    (key) => {
      const { data } = normalizeDbSpecFrontmatter({ [key]: [] });
      expect(data.migrations).toEqual([]);
    },
  );

  it('accepts English keys verbatim (idempotent)', () => {
    const english = {
      schema: 'db-spec/v1',
      documentNumber: 'DB-1',
      title: 't',
      version: '0.1.0',
      issueDate: '2026-06-26',
      status: 'draft',
      engine: 'postgres',
      authors: [{ name: 'a' }],
      tables: [{ name: 'users', columns: [{ name: 'id', type: 'bigserial' }] }],
    };
    const { data } = normalizeDbSpecFrontmatter(english);
    expect(data).toMatchObject(english);
  });
});

describe('normalizeDbSpecFrontmatter — status translations', () => {
  it.each([
    ['ドラフト', 'draft'],
    ['下書き', 'draft'],
    ['レビュー中', 'review'],
    ['査読中', 'review'],
    ['承認済', 'approved'],
    ['承認済み', 'approved'],
    ['承認', 'approved'],
    ['廃止', 'deprecated'],
    ['非推奨', 'deprecated'],
    ['draft', 'draft'],
    ['review', 'review'],
    ['approved', 'approved'],
    ['deprecated', 'deprecated'],
  ])('maps status "%s" → "%s"', (input, expected) => {
    const { data } = normalizeDbSpecFrontmatter({ ステータス: input });
    expect(data.status).toBe(expected);
  });

  it('passes through an unknown status value (Ajv will reject)', () => {
    const { data } = normalizeDbSpecFrontmatter({ ステータス: '保留' });
    expect(data.status).toBe('保留');
  });
});

describe('normalizeDbSpecFrontmatter — engine translations', () => {
  it.each([
    ['PostgreSQL', 'postgres'],
    ['postgresql', 'postgres'],
    ['Postgres', 'postgres'],
    ['MySQL', 'mysql'],
    ['SQLite', 'sqlite'],
    ['Aurora', 'aurora'],
    ['Neon', 'neon'],
    ['Supabase', 'supabase'],
    ['Turso', 'turso'],
    ['CloudSQL', 'cloudsql'],
    ['Cloud SQL', 'cloudsql'],
    ['postgres', 'postgres'],
    ['cloudsql', 'cloudsql'],
  ])('maps engine "%s" → "%s"', (input, expected) => {
    const { data } = normalizeDbSpecFrontmatter({ エンジン: input });
    expect(data.engine).toBe(expected);
  });

  it('passes through an unknown engine value (Ajv will reject)', () => {
    const { data } = normalizeDbSpecFrontmatter({ エンジン: 'oracle' });
    expect(data.engine).toBe('oracle');
  });
});

describe('normalizeDbSpecFrontmatter — theme translations', () => {
  it.each([
    ['青', 'blue'],
    ['赤', 'red'],
    ['オレンジ', 'orange'],
    ['紫', 'purple'],
    ['黒', 'black'],
    ['グレー', 'gray'],
  ])('maps theme "%s" → "%s"', (input, expected) => {
    const { data } = normalizeDbSpecFrontmatter({ テーマ: input });
    expect(data.theme).toBe(expected);
  });
});

describe('normalizeDbSpecFrontmatter — table scope', () => {
  it('translates table keys (名前 / 説明 / 列 / インデックス / トリガー)', () => {
    const { data } = normalizeDbSpecFrontmatter({
      テーブル: [
        {
          名前: 'users',
          説明: '利用者マスター',
          列: [{ 名前: 'id', 型: 'bigserial', 主キー: true }],
          インデックス: [{ 名前: 'ix_users_email', 列: ['email'], 一意: true, 方式: 'btree' }],
          トリガー: [{ 名前: 'trg_updated', 契機: 'BEFORE UPDATE', 処理: 'set updated_at = now()' }],
        },
      ],
    });
    expect(data.tables).toEqual([
      {
        name: 'users',
        description: '利用者マスター',
        columns: [{ name: 'id', type: 'bigserial', pk: true }],
        indexes: [{ name: 'ix_users_email', columns: ['email'], unique: true, using: 'btree' }],
        triggers: [{ name: 'trg_updated', on: 'BEFORE UPDATE', action: 'set updated_at = now()' }],
      },
    ]);
  });

  it.each([['列'], ['カラム'], ['項目'], ['columns']])(
    'maps table key "%s" → columns',
    (key) => {
      const { data } = normalizeDbSpecFrontmatter({
        テーブル: [{ 名前: 't', [key]: [] }],
      });
      const tables = data.tables as Array<Record<string, unknown>>;
      expect(tables[0]!.columns).toEqual([]);
    },
  );

  it('keeps index columns as verbatim string arrays', () => {
    const { data } = normalizeDbSpecFrontmatter({
      テーブル: [
        {
          名前: 'users',
          列: [{ 名前: 'id', 型: 'bigint' }],
          索引: [{ 名前: 'ix', 列: ['tenant_id', 'email'] }],
        },
      ],
    });
    const tables = data.tables as Array<Record<string, unknown>>;
    const indexes = tables[0]!.indexes as Array<Record<string, unknown>>;
    expect(indexes[0]!.columns).toEqual(['tenant_id', 'email']);
  });
});

describe('normalizeDbSpecFrontmatter — column scope', () => {
  it('translates column keys (主キー / NULL許可 / 一意 / 既定値 / 外部キー)', () => {
    const { data } = normalizeDbSpecFrontmatter({
      テーブル: [
        {
          名前: 'orders',
          列: [
            {
              名前: 'user_id',
              型: 'bigint',
              NULL許可: false,
              一意: false,
              既定値: 0,
              外部キー: { 参照テーブル: 'users', 参照列: 'id', 削除時: 'cascade' },
            },
          ],
        },
      ],
    });
    expect(data.tables).toEqual([
      {
        name: 'orders',
        columns: [
          {
            name: 'user_id',
            type: 'bigint',
            nullable: false,
            unique: false,
            default: 0,
            fk: { table: 'users', column: 'id', onDelete: 'cascade' },
          },
        ],
      },
    ]);
  });

  it('keeps column type expressions verbatim — no synonym absorption (PdM decision B-2)', () => {
    const { data } = normalizeDbSpecFrontmatter({
      テーブル: [
        {
          名前: 't',
          列: [
            { 名前: 'a', 型: 'varchar(255)' },
            { 名前: 'b', 型: '文字列' },
          ],
        },
      ],
    });
    const tables = data.tables as Array<Record<string, unknown>>;
    expect(tables[0]!.columns).toEqual([
      { name: 'a', type: 'varchar(255)' },
      { name: 'b', type: '文字列' },
    ]);
  });

  it('translates fk onUpdate and keeps fk value strings verbatim', () => {
    const { data } = normalizeDbSpecFrontmatter({
      テーブル: [
        {
          名前: 'orders',
          列: [
            {
              名前: 'tenant_id',
              型: 'bigint',
              外部キー: { テーブル: 'tenants', 列: 'id', 更新時: 'restrict' },
            },
          ],
        },
      ],
    });
    const tables = data.tables as Array<Record<string, unknown>>;
    const columns = tables[0]!.columns as Array<Record<string, unknown>>;
    expect(columns[0]!.fk).toEqual({ table: 'tenants', column: 'id', onUpdate: 'restrict' });
  });
});

describe('normalizeDbSpecFrontmatter — party scope', () => {
  it('translates author/reviewer names and roles', () => {
    const { data } = normalizeDbSpecFrontmatter({
      作成者: [
        { 名前: '田中', 役割: '設計担当' },
        { 氏名: '鈴木', 役職: 'DBA' },
      ],
      レビュアー: [{ 名称: '佐藤', 肩書き: 'PM' }],
    });
    expect(data.authors).toEqual([
      { name: '田中', role: '設計担当' },
      { name: '鈴木', role: 'DBA' },
    ]);
    expect(data.reviewers).toEqual([{ name: '佐藤', role: 'PM' }]);
  });
});

describe('normalizeDbSpecFrontmatter — warnings', () => {
  it('warns when two source keys collapse to the same target at root', () => {
    const { warnings } = normalizeDbSpecFrontmatter({
      タイトル: 'A',
      表題: 'B',
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.path).toBe('title');
  });

  it('reports nested collision paths inside table columns', () => {
    const { warnings } = normalizeDbSpecFrontmatter({
      テーブル: [{ 名前: 't', 列: [{ 名前: 'id', 列名: 'id2' }] }],
    });
    expect(warnings.some((w) => w.path === 'tables[0].columns[0].name')).toBe(true);
  });
});

describe('normalizeDbSpecFrontmatter — pass-through unknown keys', () => {
  it('keeps unknown root keys verbatim for Ajv to surface', () => {
    const { data } = normalizeDbSpecFrontmatter({ 不明: 'x', タイトル: 't' });
    expect(data).toMatchObject({ 不明: 'x', title: 't' });
  });
});
