import { describe, it, expect } from 'vitest';
import { splitFrontmatter } from '@md-business/core';
import { MemoryDocumentStore } from './store.js';
import { readDocument, validateDocument, createDocument, updateDocument } from './tools.js';

/**
 * MCP P0 ツール本体（Issue 004 Phase 2）。DocumentStore 越しで fs 非依存に単体テスト。
 * valid:true パスは ajv 検証済みの invoice テンプレ frontmatter をインラインで使う
 * （templates/invoice/standard.md 由来・妥当を確認済み）。
 */

// templates/invoice/standard.md の frontmatter（schemaVersion: invoice/v1・妥当）
const VALID_INVOICE = `---
schemaVersion: invoice/v1
invoiceNumber: INV-2026-0001
issueDate: "2026-06-30"
dueDate: "2026-07-31"
issuer:
  name: 株式会社サンプル発行元
  registrationNumber: T1234567890123
  postalCode: 100-0001
  address: 東京都千代田区千代田1-1
  tel: 03-0000-0000
  email: billing@example.com
recipient:
  name: 株式会社サンプル受領先
  honorific: 御中
  postalCode: 150-0001
  address: 東京都渋谷区神宮前1-1
items:
  - name: 業務委託費
    quantity: 1
    unit: 式
    unitPrice: 500000
    taxRate: 10
taxSummary:
  standard:
    rate: 10
    subtotal: 500000
    tax: 50000
  reduced:
    rate: 8
    subtotal: 0
    tax: 0
  exempt:
    rate: 0
    subtotal: 0
    tax: 0
totals:
  subtotal: 500000
  tax: 50000
  total: 550000
---

# 請求書

本文。`;

// schema は宣言されているが必須欠落 → 検証で invalid
const INVALID_TEST_SPEC = `---
schema: test-spec/v1
title: 未完成の検証シート
---

本文だけ。`;

// schema 宣言なし
const NO_SCHEMA = `---
title: ただのメモ
---

本文。`;

function seed() {
  return new MemoryDocumentStore({
    'invoices/INV-2026-0001.md': VALID_INVOICE,
    'test-specs/draft.md': INVALID_TEST_SPEC,
    'notes/memo.md': NO_SCHEMA,
  });
}

describe('readDocument', () => {
  it('frontmatter / body / 検出 schema を返す', async () => {
    const r = await readDocument(seed(), 'invoices/INV-2026-0001.md');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.schema).toBe('invoice/v1');
      expect(r.frontmatter['invoiceNumber']).toBe('INV-2026-0001');
      expect(r.body).toContain('# 請求書');
      expect(r.path).toBe('invoices/INV-2026-0001.md');
    }
  });

  it('schema 未宣言でも読める（schema:null）', async () => {
    const r = await readDocument(seed(), 'notes/memo.md');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.schema).toBeNull();
  });

  it('越境パスは拒否する', async () => {
    const r = await readDocument(seed(), '../secrets.md');
    expect(r.ok).toBe(false);
  });

  it('存在しないファイルは error を返す', async () => {
    const r = await readDocument(seed(), 'invoices/nope.md');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('見つかりません');
  });
});

describe('validateDocument', () => {
  it('妥当な invoice は valid:true / errors 空', async () => {
    const r = await validateDocument(seed(), 'invoices/INV-2026-0001.md');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.schema).toBe('invoice/v1');
      expect(r.valid).toBe(true);
      expect(r.errors).toEqual([]);
    }
  });

  it('必須欠落は valid:false / errors 非空', async () => {
    const r = await validateDocument(seed(), 'test-specs/draft.md');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.schema).toBe('test-spec/v1');
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it('schema 未宣言は valid:false（schema:null + schema エラー）', async () => {
    const r = await validateDocument(seed(), 'notes/memo.md');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.schema).toBeNull();
      expect(r.valid).toBe(false);
      expect(r.errors[0]?.keyword).toBe('schema');
    }
  });

  it('越境パス・不在は error を返す', async () => {
    expect((await validateDocument(seed(), '../x.md')).ok).toBe(false);
    expect((await validateDocument(seed(), 'nope.md')).ok).toBe(false);
  });
});

// invoice テンプレ frontmatter を構造化オブジェクトとして取り出す（schema キーは注入検証用に除く）
const invoiceObject = (() => {
  const { data } = splitFrontmatter(VALID_INVOICE);
  const { schemaVersion: _drop, ...rest } = data as Record<string, unknown>;
  return rest;
})();

describe('createDocument', () => {
  it('構造化 frontmatter から妥当な文書を書き出し valid:true・schema キーを注入する', async () => {
    const store = new MemoryDocumentStore();
    const r = await createDocument(store, {
      schema: 'invoice/v1',
      frontmatter: invoiceObject,
      body: '# 請求書\n\n本文。',
      path: 'invoices/new.md',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.schema).toBe('invoice/v1');
      expect(r.valid).toBe(true);
      expect(r.errors).toEqual([]);
    }
    // 実際に書き込まれ、canonical キー（schemaVersion）で schema 宣言されている
    expect(await store.exists('invoices/new.md')).toBe(true);
    const written = splitFrontmatter(await store.read('invoices/new.md'));
    expect(written.data['schemaVersion']).toBe('invoice/v1');
  });

  it('未知スキーマ id は error', async () => {
    const r = await createDocument(new MemoryDocumentStore(), {
      schema: 'unknown/v9',
      frontmatter: {},
      body: '',
      path: 'x.md',
    });
    expect(r.ok).toBe(false);
  });

  it('既存パスは上書きせず error', async () => {
    const store = new MemoryDocumentStore({ 'invoices/new.md': 'existing' });
    const r = await createDocument(store, {
      schema: 'invoice/v1',
      frontmatter: invoiceObject,
      body: '',
      path: 'invoices/new.md',
    });
    expect(r.ok).toBe(false);
    expect(await store.read('invoices/new.md')).toBe('existing');
  });

  it('越境パスは error', async () => {
    const r = await createDocument(new MemoryDocumentStore(), {
      schema: 'invoice/v1',
      frontmatter: invoiceObject,
      body: '',
      path: '../evil.md',
    });
    expect(r.ok).toBe(false);
  });

  it('不完全な frontmatter でも書き出すが valid:false で errors を返す', async () => {
    const store = new MemoryDocumentStore();
    const r = await createDocument(store, {
      schema: 'invoice/v1',
      frontmatter: { invoiceNumber: 'INV-x' },
      body: '',
      path: 'invoices/partial.md',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
    expect(await store.exists('invoices/partial.md')).toBe(true);
  });
});

describe('updateDocument', () => {
  it('frontmatter を浅くマージし、他フィールドを保ちつつ valid を再判定する', async () => {
    const store = seed();
    const r = await updateDocument(store, {
      path: 'invoices/INV-2026-0001.md',
      frontmatter: { invoiceNumber: 'INV-2026-9999' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.schema).toBe('invoice/v1');
      expect(r.valid).toBe(true);
    }
    const after = splitFrontmatter(await store.read('invoices/INV-2026-0001.md'));
    expect(after.data['invoiceNumber']).toBe('INV-2026-9999');
    // 触っていないフィールドは残る
    expect(after.data['totals']).toBeTypeOf('object');
  });

  it('body だけの更新もでき、diff に変更行が出る', async () => {
    const store = seed();
    const r = await updateDocument(store, {
      path: 'invoices/INV-2026-0001.md',
      body: '# 請求書（改訂）\n\n差し替え本文。',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diff.some((l) => l.type === 'add')).toBe(true);
      expect(r.diff.some((l) => l.type === 'del')).toBe(true);
    }
    const after = splitFrontmatter(await store.read('invoices/INV-2026-0001.md'));
    expect(after.body).toContain('改訂');
  });

  it('更新で必須が壊れれば valid:false / errors 非空', async () => {
    const store = seed();
    const r = await updateDocument(store, {
      path: 'invoices/INV-2026-0001.md',
      frontmatter: { totals: null },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it('schema 未宣言の文書更新は valid:false（schema エラー）', async () => {
    const store = seed();
    const r = await updateDocument(store, { path: 'notes/memo.md', body: '追記。' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.schema).toBeNull();
      expect(r.valid).toBe(false);
      expect(r.errors[0]?.keyword).toBe('schema');
    }
  });

  it('越境パス・不在は error を返す', async () => {
    expect((await updateDocument(seed(), { path: '../x.md' })).ok).toBe(false);
    expect((await updateDocument(seed(), { path: 'nope.md' })).ok).toBe(false);
  });
});
