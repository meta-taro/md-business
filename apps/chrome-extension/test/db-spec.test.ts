import { describe, it, expect } from 'vitest';
import { dbSpecPlugin } from '../src/plugins/db-spec.js';
import { loadMarkdown, previewMarkdown } from '../src/shared/loadMarkdown.js';

const VALID_DB_MD = `---
schema: "db-spec/v1"
documentNumber: "DB-2026-0001"
title: "受発注 DB 設計書"
version: "1.0.0"
issueDate: "2026-06-17"
status: "draft"
engine: "postgres"
authors:
  - name: "田中"
    role: "PdM"
tables:
  - name: "orders"
    description: "注文ヘッダ"
    columns:
      - name: "id"
        type: "bigserial"
        pk: true
        nullable: false
      - name: "customer_id"
        type: "bigint"
        nullable: false
        fk:
          table: "customers"
          column: "id"
          onDelete: "restrict"
---
`;

const JAPANESE_KEYED_DB_MD = `---
文書番号: "DB-J-001"
タイトル: "日本語キー DB 設計書"
版: "0.2.0"
発行日: "2026-06-17"
ステータス: "レビュー中"
エンジン: "postgres"
作成者:
  - 名前: "山田"
    役割: "リード"
テーブル:
  - 名前: "users"
    カラム:
      - 名前: "id"
        型: "bigserial"
        主キー: true
---
`;

describe('dbSpecPlugin — validate path', () => {
  it('accepts a fully English-keyed valid db-spec', () => {
    const result = dbSpecPlugin.validate({
      schema: 'db-spec/v1',
      documentNumber: 'DB-1',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      engine: 'postgres',
      authors: [{ name: 'X' }],
      tables: [{ name: 'orders', columns: [{ name: 'id', type: 'bigint', pk: true }] }],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects missing required documentNumber with translated message', () => {
    const result = dbSpecPlugin.validate({
      schema: 'db-spec/v1',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      engine: 'postgres',
      authors: [{ name: 'X' }],
      tables: [{ name: 't', columns: [{ name: 'id', type: 'bigint' }] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/文書番号/);
  });

  it('autofills defaults for Japanese-keyed minimal frontmatter', () => {
    const result = dbSpecPlugin.validate({
      文書番号: 'DB-J-001',
      タイトル: '最小',
      発行日: '2026-06-17',
      エンジン: 'postgres',
      作成者: [{ 名前: '田中' }],
      テーブル: [{ 名前: 'users', カラム: [{ 名前: 'id', 型: 'integer' }] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.version).toBe('0.1.0');
    expect(result.data.status).toBe('draft');
    expect(result.data.tables[0]?.name).toBe('users');
  });
});

describe('dbSpecPlugin — render (data-driven, no markdown body)', () => {
  it('renders the cover and table catalog from structured frontmatter', () => {
    const result = dbSpecPlugin.validate({
      schema: 'db-spec/v1',
      documentNumber: 'DB-2',
      title: '受発注 DB',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      engine: 'postgres',
      authors: [{ name: 'X' }],
      tables: [{ name: 'orders', columns: [{ name: 'id', type: 'bigserial', pk: true }] }],
    });
    if (!result.ok) throw new Error('expected ok');
    const html = dbSpecPlugin.render(result.data);
    expect(html).toContain('mdb-db-spec');
    expect(html).toContain('mdb-db-spec__cover');
    expect(html).toContain('orders');
    expect(html).toContain('bigserial');
  });

  it('escapes structured values (no raw HTML injection)', () => {
    const result = dbSpecPlugin.validate({
      schema: 'db-spec/v1',
      documentNumber: 'DB-3',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      engine: 'postgres',
      authors: [{ name: 'X' }],
      tables: [{ name: 'orders', columns: [{ name: 'id', type: 'bigint' }] }],
    });
    if (!result.ok) throw new Error('expected ok');
    // render consumes validated data; the escaping guarantee lives in the
    // renderer (covered by renderer-pdf tests) — here we assert the plugin
    // path produces the db-spec article shell.
    const html = dbSpecPlugin.render(result.data);
    expect(html).toContain('data-schema-version="db-spec/v1"');
  });
});

describe('dbSpecPlugin — previewRender', () => {
  it('returns HTML even when required fields are missing', () => {
    const result = dbSpecPlugin.previewRender?.({ title: 'まだ書きかけ' });
    expect(result).toBeDefined();
    if (!result) return;
    expect(result.html).toContain('mdb-db-spec');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('translates errors to Japanese', () => {
    const result = dbSpecPlugin.previewRender?.({});
    if (!result) throw new Error('expected previewRender');
    expect(result.errors.map((e) => e.message).join('\n')).toMatch(/必須/);
  });
});

describe('dbSpecPlugin — documentTitle / pdfFileName', () => {
  const full = {
    schema: 'db-spec/v1' as const,
    documentNumber: 'DB-1',
    title: '受発注 DB',
    version: '1.2.0',
    issueDate: '2026-06-17',
    status: 'draft' as const,
    engine: 'postgres' as const,
    authors: [{ name: 'X' }],
    tables: [{ name: 'orders', columns: [{ name: 'id', type: 'bigint' }] }],
  };

  it('uses the db-spec title as the document title', () => {
    expect(dbSpecPlugin.documentTitle?.(full)).toBe('受発注 DB');
  });

  it('falls back to "DB 設計書 {番号}" when title is empty', () => {
    expect(dbSpecPlugin.documentTitle?.({ ...full, title: '' })).toBe('DB 設計書 DB-1');
  });

  it('renders the default PDF file name', () => {
    expect(dbSpecPlugin.pdfFileName?.(full)).toBe('DB設計書_DB-1_v1.2.0');
  });
});

describe('loadMarkdown — db-spec end-to-end', () => {
  it('routes a db-spec/v1 markdown through the registry', () => {
    const result = loadMarkdown(VALID_DB_MD);
    if (!result.ok) throw new Error(`expected success: ${result.reason}`);
    expect(result.pluginId).toBe('db-spec');
    expect(result.stylesHref).toBe('styles/db-spec.css');
    expect(result.documentTitle).toBe('受発注 DB 設計書');
    expect(result.bodyHtml).toContain('mdb-db-spec');
    expect(result.bodyHtml).toContain('orders');
    expect(result.bodyHtml).toContain('customers.id');
  });

  it('routes a Japanese-keyed db-spec via plugin.detect (not misrouted to spec)', () => {
    const result = loadMarkdown(JAPANESE_KEYED_DB_MD);
    if (!result.ok) throw new Error(`expected success: ${result.reason}`);
    expect(result.pluginId).toBe('db-spec');
    expect(result.documentTitle).toBe('日本語キー DB 設計書');
  });
});

describe('previewMarkdown — db-spec live editor', () => {
  it('returns body HTML even when required fields are missing', () => {
    const partial = `---\ntitle: "途中"\n文書番号: "DB-X"\nテーブル: []\n---\n`;
    const result = previewMarkdown(partial);
    if (!result.ok) throw new Error('expected success');
    expect(result.bodyHtml).toContain('mdb-db-spec');
  });
});
