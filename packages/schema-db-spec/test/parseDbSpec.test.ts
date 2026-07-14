import { describe, it, expect } from 'vitest';
import validate from '../dist/validate.compiled.js';
import { parseDbSpecMarkdown, parseDbSpecObject } from '../src/index.js';

const JAPANESE_MD = `---
スキーマ: db-spec/v1
文書番号: DB-2026-001
タイトル: 受発注ワークフロー DB 設計
版: 1.0.0
発行日: 2026-06-26
ステータス: 承認済
エンジン: PostgreSQL
作成者:
  - 名前: 田中
    役割: PdM
テーブル:
  - 名前: users
    説明: 利用者
    列:
      - 名前: id
        型: bigserial
        主キー: true
      - 名前: email
        型: text
        一意: true
        NULL許可: false
  - 名前: orders
    列:
      - 名前: id
        型: bigserial
        主キー: true
      - 名前: user_id
        型: bigint
        外部キー:
          参照テーブル: users
          参照列: id
          削除時: cascade
    インデックス:
      - 名前: idx_orders_user_id
        列:
          - user_id
---

# 本文

補足説明。
`;

describe('parseDbSpecMarkdown — success path', () => {
  it('parses Japanese frontmatter end-to-end', () => {
    const result = parseDbSpecMarkdown(JAPANESE_MD, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dbSpec.schema).toBe('db-spec/v1');
    expect(result.dbSpec.documentNumber).toBe('DB-2026-001');
    expect(result.dbSpec.status).toBe('approved');
    expect(result.dbSpec.engine).toBe('postgres');
    expect(result.dbSpec.tables).toHaveLength(2);
    expect(result.dbSpec.tables[0]?.columns[0]?.pk).toBe(true);
    expect(result.dbSpec.tables[1]?.columns[1]?.fk?.table).toBe('users');
    expect(result.dbSpec.tables[1]?.columns[1]?.fk?.onDelete).toBe('cascade');
    expect(result.dbSpec.tables[1]?.indexes?.[0]?.columns).toEqual(['user_id']);
    expect(result.body).toContain('# 本文');
    expect(result.warnings).toEqual([]);
  });

  it('keeps column type values verbatim (B-2)', () => {
    const md = JAPANESE_MD.replace('型: bigserial', '型: 文字列');
    const result = parseDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dbSpec.tables[0]?.columns[0]?.type).toBe('文字列');
  });
});

describe('parseDbSpecMarkdown — autofill defaults', () => {
  it('fills schema / version / status when omitted', () => {
    const md = `---
文書番号: DB-2026-002
タイトル: 最小構成
発行日: 2026-06-26
エンジン: sqlite
作成者:
  - 名前: 田中
テーブル:
  - 名前: notes
    列:
      - 名前: id
        型: integer
---
`;
    const result = parseDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dbSpec.schema).toBe('db-spec/v1');
    expect(result.dbSpec.version).toBe('0.1.0');
    expect(result.dbSpec.status).toBe('draft');
  });
});

describe('parseDbSpecMarkdown — failure path', () => {
  it('fails when required tables is missing', () => {
    const md = `---
文書番号: DB-2026-003
タイトル: テーブルなし
エンジン: postgres
---
`;
    const result = parseDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.keyword === 'required')).toBe(true);
  });

  it('fails on an invalid engine value', () => {
    const md = JAPANESE_MD.replace('エンジン: PostgreSQL', 'エンジン: oracle');
    const result = parseDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path === '/engine' && e.keyword === 'enum')).toBe(true);
  });
});

describe('parseDbSpecMarkdown — warnings surface', () => {
  it('surfaces normalize collision warnings on success', () => {
    const md = `---
タイトル: 衝突
title: collision
文書番号: DB-2026-004
発行日: 2026-06-26
エンジン: postgres
作成者:
  - 名前: 田中
テーブル:
  - 名前: t
    列:
      - 名前: id
        型: integer
---
`;
    const result = parseDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'title')).toBe(true);
  });

  it('surfaces autofill consistency warnings (pk + nullable)', () => {
    const md = `---
文書番号: DB-2026-005
タイトル: 矛盾
発行日: 2026-06-26
エンジン: postgres
作成者:
  - 名前: 田中
テーブル:
  - 名前: t
    列:
      - 名前: id
        型: integer
        主キー: true
        NULL許可: true
---
`;
    const result = parseDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'tables[0].columns[0].nullable')).toBe(true);
  });
});

describe('parseDbSpecObject', () => {
  it('parses an already-split frontmatter object', () => {
    const result = parseDbSpecObject(
      {
        文書番号: 'DB-2026-006',
        タイトル: 'オブジェクト入力',
        発行日: '2026-06-26',
        エンジン: 'mysql',
        作成者: [{ 名前: '田中' }],
        テーブル: [{ 名前: 't', 列: [{ 名前: 'id', 型: 'bigint' }] }],
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dbSpec.engine).toBe('mysql');
    expect(result.dbSpec.schema).toBe('db-spec/v1');
  });

  it('fails for a non-object input', () => {
    const result = parseDbSpecObject('not an object', validate);
    expect(result.ok).toBe(false);
  });
});
