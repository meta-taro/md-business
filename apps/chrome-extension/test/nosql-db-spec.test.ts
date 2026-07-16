import { describe, it, expect } from 'vitest';
import { nosqlDbSpecPlugin } from '../src/plugins/nosql-db-spec.js';
import { loadMarkdown, previewMarkdown } from '../src/shared/loadMarkdown.js';

const VALID_NOSQL_MD = `---
schema: "nosql-db-spec/v1"
documentNumber: "NDB-2026-0001"
title: "受発注 NoSQL 設計書"
version: "1.0.0"
issueDate: "2026-06-17"
status: "draft"
engine: "firestore"
multiRegion: "nam5"
authors:
  - name: "田中"
    role: "PdM"
collections:
  - path: "users"
    description: "ユーザードキュメント"
    docIdStrategy: "auth-uid"
    shape:
      displayName:
        type: "string"
        required: true
      profile:
        type: "map"
        shape:
          bio:
            type: "string"
    indexes:
      - fields: ["displayName"]
        mode: "ASCENDING"
---
`;

const JAPANESE_KEYED_NOSQL_MD = `---
文書番号: "NDB-J-001"
タイトル: "日本語キー NoSQL 設計書"
版: "0.2.0"
発行日: "2026-06-17"
ステータス: "レビュー中"
エンジン: "Firestore"
作成者:
  - 名前: "山田"
    役割: "リード"
コレクション:
  - パス: "orders"
    ドキュメントID戦略: "複合"
    パーティションキー: "userId"
    ソートキー: "createdAt"
    形状:
      userId:
        type: "string"
        required: true
      createdAt:
        type: "timestamp"
        required: true
---
`;

describe('nosqlDbSpecPlugin — validate path', () => {
  it('accepts a fully English-keyed valid nosql-db-spec', () => {
    const result = nosqlDbSpecPlugin.validate({
      schema: 'nosql-db-spec/v1',
      documentNumber: 'NDB-1',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      engine: 'firestore',
      authors: [{ name: 'X' }],
      collections: [
        { path: 'users', docIdStrategy: 'auth-uid', shape: { name: { type: 'string' } } },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects missing required documentNumber with translated message', () => {
    const result = nosqlDbSpecPlugin.validate({
      schema: 'nosql-db-spec/v1',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      engine: 'firestore',
      authors: [{ name: 'X' }],
      collections: [{ path: 'users', docIdStrategy: 'uuid', shape: { id: { type: 'string' } } }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/文書番号/);
  });

  it('autofills defaults for Japanese-keyed minimal frontmatter', () => {
    const result = nosqlDbSpecPlugin.validate({
      文書番号: 'NDB-J-001',
      タイトル: '最小',
      発行日: '2026-06-17',
      エンジン: 'Firestore',
      作成者: [{ 名前: '田中' }],
      コレクション: [
        {
          パス: 'sessions',
          ドキュメントID戦略: 'UUID',
          形状: { id: { type: 'string' } },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.version).toBe('0.1.0');
    expect(result.data.status).toBe('draft');
    expect(result.data.collections[0]?.path).toBe('sessions');
  });
});

describe('nosqlDbSpecPlugin — render (data-driven, no markdown body)', () => {
  it('renders the cover and collection catalog from structured frontmatter', () => {
    const result = nosqlDbSpecPlugin.validate({
      schema: 'nosql-db-spec/v1',
      documentNumber: 'NDB-2',
      title: '受発注 NoSQL',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      engine: 'firestore',
      authors: [{ name: 'X' }],
      collections: [
        { path: 'users', docIdStrategy: 'auth-uid', shape: { name: { type: 'string' } } },
      ],
    });
    if (!result.ok) throw new Error('expected ok');
    const html = nosqlDbSpecPlugin.render(result.data);
    expect(html).toContain('mdb-nosql-db-spec');
    expect(html).toContain('mdb-nosql-db-spec__cover');
    expect(html).toContain('users');
    expect(html).toContain('Cloud Firestore');
  });

  it('produces the nosql-db-spec article shell with the schema version', () => {
    const result = nosqlDbSpecPlugin.validate({
      schema: 'nosql-db-spec/v1',
      documentNumber: 'NDB-3',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      engine: 'dynamodb',
      authors: [{ name: 'X' }],
      collections: [
        {
          path: 'sessions',
          docIdStrategy: 'composite',
          partitionKeyField: 'pk',
          sortKeyField: 'sk',
          shape: { pk: { type: 'string' }, sk: { type: 'string' } },
        },
      ],
    });
    if (!result.ok) throw new Error('expected ok');
    const html = nosqlDbSpecPlugin.render(result.data);
    expect(html).toContain('data-schema-version="nosql-db-spec/v1"');
  });
});

describe('nosqlDbSpecPlugin — previewRender', () => {
  it('returns HTML even when required fields are missing', () => {
    const result = nosqlDbSpecPlugin.previewRender?.({ title: 'まだ書きかけ' });
    expect(result).toBeDefined();
    if (!result) return;
    expect(result.html).toContain('mdb-nosql-db-spec');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('translates errors to Japanese', () => {
    const result = nosqlDbSpecPlugin.previewRender?.({});
    if (!result) throw new Error('expected previewRender');
    expect(result.errors.map((e) => e.message).join('\n')).toMatch(/必須/);
  });

  it('returns no errors for a fully valid document (no preview defaults injected)', () => {
    // Exercising the happy path with every required field present ensures the
    // withPreviewDefaults `value already set` branches and the validation.ok
    // side of previewRender are covered.
    const result = nosqlDbSpecPlugin.previewRender?.({
      schema: 'nosql-db-spec/v1',
      documentNumber: 'NDB-9',
      title: '完成版',
      version: '2.0.0',
      issueDate: '2026-06-17',
      status: 'approved',
      engine: 'mongodb',
      authors: [{ name: '田中' }],
      collections: [
        { path: 'users', docIdStrategy: 'auto', shape: { name: { type: 'string' } } },
      ],
    });
    if (!result) throw new Error('expected previewRender');
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('mdb-nosql-db-spec');
    expect(result.html).toContain('完成版');
  });
});

describe('nosqlDbSpecPlugin — documentTitle / pdfFileName', () => {
  const full = {
    schema: 'nosql-db-spec/v1' as const,
    documentNumber: 'NDB-1',
    title: '受発注 NoSQL',
    version: '1.2.0',
    issueDate: '2026-06-17',
    status: 'draft' as const,
    engine: 'firestore' as const,
    authors: [{ name: 'X' }],
    collections: [
      { path: 'users', docIdStrategy: 'auth-uid' as const, shape: { name: { type: 'string' as const } } },
    ],
  };

  it('uses the nosql-db-spec title as the document title', () => {
    expect(nosqlDbSpecPlugin.documentTitle?.(full)).toBe('受発注 NoSQL');
  });

  it('falls back to "NoSQL 設計書 {番号}" when title is empty', () => {
    expect(nosqlDbSpecPlugin.documentTitle?.({ ...full, title: '' })).toBe('NoSQL 設計書 NDB-1');
  });

  it('renders the default PDF file name', () => {
    expect(nosqlDbSpecPlugin.pdfFileName?.(full)).toBe('NoSQL設計書_NDB-1_v1.2.0');
  });
});

describe('loadMarkdown — nosql-db-spec end-to-end', () => {
  it('routes a nosql-db-spec/v1 markdown through the registry', () => {
    const result = loadMarkdown(VALID_NOSQL_MD);
    if (!result.ok) throw new Error(`expected success: ${result.reason}`);
    expect(result.pluginId).toBe('nosql-db-spec');
    expect(result.stylesHref).toBe('styles/nosql-db-spec.css');
    expect(result.documentTitle).toBe('受発注 NoSQL 設計書');
    expect(result.bodyHtml).toContain('mdb-nosql-db-spec');
    expect(result.bodyHtml).toContain('users');
    expect(result.bodyHtml).toContain('nam5');
  });

  it('routes a Japanese-keyed nosql-db-spec via plugin.detect (not misrouted to spec)', () => {
    const result = loadMarkdown(JAPANESE_KEYED_NOSQL_MD);
    if (!result.ok) throw new Error(`expected success: ${result.reason}`);
    expect(result.pluginId).toBe('nosql-db-spec');
    expect(result.documentTitle).toBe('日本語キー NoSQL 設計書');
  });
});

describe('previewMarkdown — nosql-db-spec live editor', () => {
  it('returns body HTML even when required fields are missing', () => {
    const partial = `---\ntitle: "途中"\n文書番号: "NDB-X"\nコレクション: []\n---\n`;
    const result = previewMarkdown(partial);
    if (!result.ok) throw new Error('expected success');
    expect(result.bodyHtml).toContain('mdb-nosql-db-spec');
  });
});
