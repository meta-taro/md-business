// @vitest-environment jsdom
//
// 業務スキーマ非該当の場合に通る Markdown フォールバックが sanitize（DOMPurify）を
// 使うため window が要る。
/**
 * 1 文書を開いたときに、その文書のスキーマぶんだけ読み込むことの確認。
 *
 * 7 スキーマの検証器は合わせて 485 KB あり、そのうち 1 つしか使わない。全部まとめて
 * 読むと、請求書を 1 枚開くのに API 設計書と NoSQL 設計書の検証器まで読むことになる。
 * 「読んだ ID」を数えることでしか、この性質は外から確かめられない（描画結果は
 * どちらの作りでも同じものが出るため）。
 *
 * 各 it が resetModules から始まるのは、読み込み済みの記録がモジュール側に残るため。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const INVOICE = `---
schema: invoice/v1
invoiceNumber: A-1
issuer:
  name: テスト
items:
  - name: 作業
    quantity: 1
    unitPrice: 1000
---
`;

const DB_SPEC = `---
schema: db-spec/v1
title: テスト DB
tables: []
---
`;

const PLAIN = `# ただの Markdown

業務スキーマではない。
`;

async function load() {
  const [{ renderPreview }, { loadedProviderIds }] = await Promise.all([
    import('../renderPreview'),
    import('./lazy'),
  ]);
  return { renderPreview, loadedProviderIds };
}

describe('スキーマごとの読み込み', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('何も描く前は 1 つも読んでいない', async () => {
    const { loadedProviderIds } = await load();
    expect(loadedProviderIds()).toEqual([]);
  });

  it('請求書を描くと請求書だけ読む', async () => {
    const { renderPreview, loadedProviderIds } = await load();
    const result = await renderPreview(INVOICE);
    expect(result.ok).toBe(true);
    expect(loadedProviderIds()).toEqual(['invoice']);
  });

  it('別のスキーマを描くとそのぶんだけ増える', async () => {
    const { renderPreview, loadedProviderIds } = await load();
    await renderPreview(INVOICE);
    await renderPreview(DB_SPEC);
    expect(loadedProviderIds().sort()).toEqual(['db-spec', 'invoice']);
  });

  it('同じスキーマを繰り返し描いても読み直さない', async () => {
    const { renderPreview, loadedProviderIds } = await load();
    await renderPreview(INVOICE);
    await renderPreview(INVOICE);
    expect(loadedProviderIds()).toEqual(['invoice']);
  });

  it('業務スキーマでない Markdown はどれも読まない', async () => {
    const { renderPreview, loadedProviderIds } = await load();
    const result = await renderPreview(PLAIN);
    expect(result.ok).toBe(true);
    expect(loadedProviderIds()).toEqual([]);
  });
});
