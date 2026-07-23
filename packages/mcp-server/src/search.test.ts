import { describe, it, expect } from 'vitest';
import { MemoryDocumentStore } from './store.js';
import {
  matchesQuery,
  extractTitle,
  extractDate,
  inDateRange,
  makeExcerpt,
  searchDocuments,
} from './search.js';

/**
 * search_documents（Issue 004 Phase 2・P0）。store 全走査で query / schema / 日付範囲を
 * 絞り込む。判定は純ヘルパへ分離して単体テスト、searchDocuments は薄い統合とする。
 */
describe('matchesQuery', () => {
  it('空クエリは常に true', () => {
    expect(matchesQuery('anything', undefined)).toBe(true);
    expect(matchesQuery('anything', '')).toBe(true);
    expect(matchesQuery('anything', '   ')).toBe(true);
  });

  it('大文字小文字を無視して部分一致する', () => {
    expect(matchesQuery('Hello World', 'hello')).toBe(true);
    expect(matchesQuery('請求書 業務委託費', '業務委託')).toBe(true);
    expect(matchesQuery('abc', 'xyz')).toBe(false);
  });
});

describe('extractTitle', () => {
  it('frontmatter.title を最優先', () => {
    expect(extractTitle({ title: '基本設計書' }, '# 見出し')).toBe('基本設計書');
  });

  it('title 無ければ invoiceNumber、それも無ければ本文の先頭見出し', () => {
    expect(extractTitle({ invoiceNumber: 'INV-1' }, '本文')).toBe('INV-1');
    expect(extractTitle({}, 'まえがき\n# 実タイトル\n本文')).toBe('実タイトル');
  });

  it('該当なしは null', () => {
    expect(extractTitle({}, '見出しのない本文')).toBeNull();
  });
});

describe('extractDate', () => {
  it('既知の日付キーから最初の ISO 日付を拾う', () => {
    expect(extractDate({ issueDate: '2026-06-30' })).toBe('2026-06-30');
    expect(extractDate({ date: '2026-05-01' })).toBe('2026-05-01');
  });

  it('日付でない値・欠落は null', () => {
    expect(extractDate({ issueDate: 'いつか' })).toBeNull();
    expect(extractDate({ title: 'x' })).toBeNull();
  });
});

describe('inDateRange', () => {
  it('範囲未指定は常に true', () => {
    expect(inDateRange('2026-06-30', undefined, undefined)).toBe(true);
    expect(inDateRange(null, undefined, undefined)).toBe(true);
  });

  it('from/to 境界を含めて判定する', () => {
    expect(inDateRange('2026-06-30', '2026-06-01', '2026-06-30')).toBe(true);
    expect(inDateRange('2026-07-01', '2026-06-01', '2026-06-30')).toBe(false);
    expect(inDateRange('2026-05-31', '2026-06-01', undefined)).toBe(false);
  });

  it('範囲指定があるのに日付なしは除外', () => {
    expect(inDateRange(null, '2026-06-01', undefined)).toBe(false);
  });
});

describe('makeExcerpt', () => {
  it('本文の最初の非空行を返す（長すぎれば切る）', () => {
    expect(makeExcerpt('\n\n最初の行\n次の行')).toBe('最初の行');
    expect(makeExcerpt('a'.repeat(200)).length).toBeLessThanOrEqual(120);
  });

  it('本文が空なら空文字', () => {
    expect(makeExcerpt('   \n  ')).toBe('');
  });
});

const INVOICE = `---
schema: invoice/v1
invoiceNumber: INV-2026-0001
issueDate: "2026-06-30"
---

# 請求書

業務委託費 の明細。`;

const SPEC = `---
スキーマ: spec/v1
title: 基本設計書サンプル
date: "2026-05-01"
---

概要。`;

const TEST_SPEC = `---
schema: test-spec/v1
title: 検証シート案
---

テスト項目。`;

const MEMO = `---
title: ただのメモ
---

雑記。`;

function seed() {
  return new MemoryDocumentStore({
    'invoices/INV-2026-0001.md': INVOICE,
    'specs/basic.md': SPEC,
    'test-specs/draft.md': TEST_SPEC,
    'notes/memo.md': MEMO,
  });
}

describe('searchDocuments', () => {
  it('クエリ無し・フィルタ無しは全件（path ソート）', async () => {
    const r = await searchDocuments(seed(), {});
    expect(r.matches.map((m) => m.path)).toEqual([
      'invoices/INV-2026-0001.md',
      'notes/memo.md',
      'specs/basic.md',
      'test-specs/draft.md',
    ]);
  });

  it('本文クエリで絞り込む', async () => {
    const r = await searchDocuments(seed(), { query: '業務委託' });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]?.path).toBe('invoices/INV-2026-0001.md');
    expect(r.matches[0]?.schema).toBe('invoice/v1');
  });

  it('schema フィルタで種別を絞る', async () => {
    const r = await searchDocuments(seed(), { schema: 'test-spec/v1' });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]?.title).toBe('検証シート案');
  });

  it('日付範囲で絞る（issueDate / date を横断）', async () => {
    const r = await searchDocuments(seed(), { dateFrom: '2026-06-01', dateTo: '2026-06-30' });
    expect(r.matches.map((m) => m.path)).toEqual(['invoices/INV-2026-0001.md']);
  });

  it('match は path / schema / title / date / excerpt を持つ', async () => {
    const r = await searchDocuments(seed(), { schema: 'invoice/v1' });
    const m = r.matches[0];
    expect(m?.path).toBe('invoices/INV-2026-0001.md');
    expect(m?.schema).toBe('invoice/v1');
    expect(m?.title).toBe('INV-2026-0001');
    expect(m?.date).toBe('2026-06-30');
    expect(m?.excerpt.length).toBeGreaterThan(0);
  });
});
