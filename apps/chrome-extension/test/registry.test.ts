import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../src/plugins/registry.js';
import { invoicePlugin } from '../src/plugins/invoice.js';
import { specPlugin } from '../src/plugins/spec.js';
import { testSpecPlugin } from '../src/plugins/test-spec.js';
import { dbSpecPlugin } from '../src/plugins/db-spec.js';
import { nosqlDbSpecPlugin } from '../src/plugins/nosql-db-spec.js';
import { apiSpecPlugin } from '../src/plugins/api-spec.js';
import { createDefaultRegistry } from '../src/plugins/index.js';
import type { SchemaPlugin } from '../src/plugins/types.js';

function dummyPlugin(id: string): SchemaPlugin {
  return {
    id,
    label: id,
    schema: { type: 'object' },
    stylesHref: `styles/${id}.css`,
    validate: (frontmatter) => ({ ok: true, data: frontmatter }),
    render: () => `<div data-id="${id}"></div>`,
  };
}

describe('PluginRegistry', () => {
  it('registers and lists plugins', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('a'));
    r.register(dummyPlugin('b'));
    expect(r.list().map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('throws on duplicate id', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('a'));
    expect(() => r.register(dummyPlugin('a'))).toThrow(/already registered/);
  });

  it('resolves via explicit schema field', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('invoice'));
    expect(r.resolve({ schema: 'invoice' })?.id).toBe('invoice');
  });

  it('resolves via schemaVersion prefix', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('invoice'));
    expect(r.resolve({ schemaVersion: 'invoice/v1' })?.id).toBe('invoice');
  });

  it('resolves via schema field prefix (e.g. "test-spec/v1" → "test-spec")', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('test-spec'));
    expect(r.resolve({ schema: 'test-spec/v1' })?.id).toBe('test-spec');
  });

  it('returns undefined when nothing matches', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('invoice'));
    expect(r.resolve({ foo: 'bar' })).toBeUndefined();
    expect(r.resolve({ schema: 'design-doc' })).toBeUndefined();
  });

  it('prefers explicit schema field over schemaVersion', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('invoice'));
    r.register(dummyPlugin('design-doc'));
    expect(
      r.resolve({ schema: 'design-doc', schemaVersion: 'invoice/v1' })?.id,
    ).toBe('design-doc');
  });

  it('falls back to plugin.detect() when no schema field is present', () => {
    const r = new PluginRegistry();
    const detectingPlugin: SchemaPlugin = {
      ...dummyPlugin('marker-schema'),
      detect: (fm) => '請求書番号' in fm,
    };
    r.register(detectingPlugin);
    expect(r.resolve({ 請求書番号: 'INV-1' })?.id).toBe('marker-schema');
    expect(r.resolve({ unrelated: 'no' })).toBeUndefined();
  });
});

describe('invoicePlugin.detect', () => {
  it('claims documents with Japanese marker keys', () => {
    expect(invoicePlugin.detect?.({ 請求書番号: 'INV-1' })).toBe(true);
    expect(invoicePlugin.detect?.({ 品目: [] })).toBe(true);
    expect(invoicePlugin.detect?.({ 発行元: {} })).toBe(true);
  });

  it('claims documents with English marker keys', () => {
    expect(invoicePlugin.detect?.({ invoiceNumber: 'X' })).toBe(true);
    expect(invoicePlugin.detect?.({ items: [] })).toBe(true);
  });

  it('does not claim unrelated documents', () => {
    expect(invoicePlugin.detect?.({ title: 'just a note' })).toBe(false);
  });
});

describe('specPlugin.detect', () => {
  it('claims documents with Japanese marker keys', () => {
    expect(specPlugin.detect?.({ 文書番号: 'SPEC-1' })).toBe(true);
    expect(specPlugin.detect?.({ 章ファイル: [] })).toBe(true);
    expect(specPlugin.detect?.({ レビュアー: [] })).toBe(true);
  });

  it('claims documents with English marker keys', () => {
    expect(specPlugin.detect?.({ documentNumber: 'X' })).toBe(true);
    expect(specPlugin.detect?.({ chapters: [] })).toBe(true);
    expect(specPlugin.detect?.({ reviewers: [] })).toBe(true);
  });

  it('does not claim unrelated documents', () => {
    expect(specPlugin.detect?.({ title: 'note' })).toBe(false);
    expect(specPlugin.detect?.({ items: [], 請求書番号: 'X' })).toBe(false);
  });
});

describe('testSpecPlugin.detect', () => {
  it('claims documents with Japanese marker keys', () => {
    expect(testSpecPlugin.detect?.({ 列: [] })).toBe(true);
    expect(testSpecPlugin.detect?.({ 連携シートID: 'x' })).toBe(true);
  });

  it('claims documents with English marker keys', () => {
    expect(testSpecPlugin.detect?.({ columns: [] })).toBe(true);
    expect(testSpecPlugin.detect?.({ googleSheetId: 'x' })).toBe(true);
  });

  it('does not claim unrelated documents', () => {
    expect(testSpecPlugin.detect?.({ title: 'note' })).toBe(false);
    expect(testSpecPlugin.detect?.({ 請求書番号: 'INV-1' })).toBe(false);
  });

  it('does not steal documents with only reviewers / レビュアー (spec keeps them)', () => {
    expect(testSpecPlugin.detect?.({ reviewers: [] })).toBe(false);
    expect(testSpecPlugin.detect?.({ レビュアー: [] })).toBe(false);
  });
});

describe('dbSpecPlugin.detect', () => {
  it('claims documents with the RDB table marker (English / Japanese)', () => {
    expect(dbSpecPlugin.detect?.({ tables: [] })).toBe(true);
    expect(dbSpecPlugin.detect?.({ テーブル: [] })).toBe(true);
  });

  it('does not claim unrelated documents', () => {
    expect(dbSpecPlugin.detect?.({ title: 'note' })).toBe(false);
    expect(dbSpecPlugin.detect?.({ 請求書番号: 'INV-1' })).toBe(false);
  });

  it('does not steal documents with only documentNumber / reviewers (spec keeps them)', () => {
    // A DB 設計書 also carries documentNumber / reviewers, so db-spec must key
    // off `tables` / `テーブル` alone — otherwise it would poach plain 基本設計書.
    expect(dbSpecPlugin.detect?.({ documentNumber: 'X' })).toBe(false);
    expect(dbSpecPlugin.detect?.({ reviewers: [] })).toBe(false);
    expect(dbSpecPlugin.detect?.({ 文書番号: 'X' })).toBe(false);
    expect(dbSpecPlugin.detect?.({ レビュアー: [] })).toBe(false);
  });

  it('does not claim the nosql collection marker (disjoint from db-spec)', () => {
    expect(dbSpecPlugin.detect?.({ collections: [] })).toBe(false);
    expect(dbSpecPlugin.detect?.({ コレクション: [] })).toBe(false);
  });
});

describe('nosqlDbSpecPlugin.detect', () => {
  it('claims documents with the document-store collection marker (English / Japanese)', () => {
    expect(nosqlDbSpecPlugin.detect?.({ collections: [] })).toBe(true);
    expect(nosqlDbSpecPlugin.detect?.({ コレクション: [] })).toBe(true);
  });

  it('does not claim unrelated documents', () => {
    expect(nosqlDbSpecPlugin.detect?.({ title: 'note' })).toBe(false);
    expect(nosqlDbSpecPlugin.detect?.({ 請求書番号: 'INV-1' })).toBe(false);
  });

  it('does not steal documents with only documentNumber / reviewers (spec keeps them)', () => {
    expect(nosqlDbSpecPlugin.detect?.({ documentNumber: 'X' })).toBe(false);
    expect(nosqlDbSpecPlugin.detect?.({ reviewers: [] })).toBe(false);
    expect(nosqlDbSpecPlugin.detect?.({ 文書番号: 'X' })).toBe(false);
    expect(nosqlDbSpecPlugin.detect?.({ レビュアー: [] })).toBe(false);
  });

  it('does not claim the RDB table marker (disjoint from nosql-db-spec)', () => {
    expect(nosqlDbSpecPlugin.detect?.({ tables: [] })).toBe(false);
    expect(nosqlDbSpecPlugin.detect?.({ テーブル: [] })).toBe(false);
  });
});

describe('apiSpecPlugin.detect', () => {
  it('claims documents with the endpoint marker (English / Japanese)', () => {
    expect(apiSpecPlugin.detect?.({ endpoints: [] })).toBe(true);
    expect(apiSpecPlugin.detect?.({ エンドポイント: [] })).toBe(true);
  });

  it('does not claim unrelated documents', () => {
    expect(apiSpecPlugin.detect?.({ title: 'note' })).toBe(false);
    expect(apiSpecPlugin.detect?.({ 請求書番号: 'INV-1' })).toBe(false);
  });

  it('does not steal documents with only documentNumber / reviewers (spec keeps them)', () => {
    expect(apiSpecPlugin.detect?.({ documentNumber: 'X' })).toBe(false);
    expect(apiSpecPlugin.detect?.({ reviewers: [] })).toBe(false);
    expect(apiSpecPlugin.detect?.({ 文書番号: 'X' })).toBe(false);
    expect(apiSpecPlugin.detect?.({ レビュアー: [] })).toBe(false);
  });

  it('does not claim the RDB table / nosql collection markers (disjoint)', () => {
    expect(apiSpecPlugin.detect?.({ tables: [] })).toBe(false);
    expect(apiSpecPlugin.detect?.({ テーブル: [] })).toBe(false);
    expect(apiSpecPlugin.detect?.({ collections: [] })).toBe(false);
    expect(apiSpecPlugin.detect?.({ コレクション: [] })).toBe(false);
  });
});

describe('createDefaultRegistry', () => {
  it('ships invoice, test-spec, db-spec, nosql-db-spec, api-spec, spec (specific markers before spec for detect order)', () => {
    const r = createDefaultRegistry();
    expect(r.get('invoice')).toBe(invoicePlugin);
    expect(r.get('test-spec')).toBe(testSpecPlugin);
    expect(r.get('db-spec')).toBe(dbSpecPlugin);
    expect(r.get('nosql-db-spec')).toBe(nosqlDbSpecPlugin);
    expect(r.get('api-spec')).toBe(apiSpecPlugin);
    expect(r.get('spec')).toBe(specPlugin);
    expect(r.list().map((p) => p.id)).toEqual([
      'invoice',
      'test-spec',
      'db-spec',
      'nosql-db-spec',
      'api-spec',
      'spec',
    ]);
  });

  it('routes a Japanese-keyed DB 設計書 to db-spec, not spec', () => {
    const r = createDefaultRegistry();
    // Has both `文書番号` (spec claims it) and `テーブル` (db-spec claims it):
    // db-spec is registered first, so it must win.
    expect(r.resolve({ 文書番号: 'DB-1', テーブル: [] })?.id).toBe('db-spec');
  });

  it('routes a Japanese-keyed NoSQL 設計書 to nosql-db-spec, not spec', () => {
    const r = createDefaultRegistry();
    // Has both `文書番号` (spec claims it) and `コレクション` (nosql-db-spec claims it):
    // nosql-db-spec is registered before spec, so it must win.
    expect(r.resolve({ 文書番号: 'NDB-1', コレクション: [] })?.id).toBe('nosql-db-spec');
  });

  it('routes a Japanese-keyed API 設計書 to api-spec, not spec', () => {
    const r = createDefaultRegistry();
    // Has both `文書番号` (spec claims it) and `エンドポイント` (api-spec claims it):
    // api-spec is registered before spec, so it must win.
    expect(r.resolve({ 文書番号: 'API-1', エンドポイント: [] })?.id).toBe('api-spec');
  });
});
