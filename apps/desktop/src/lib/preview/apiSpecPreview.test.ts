import { describe, it, expect } from 'vitest';
import { renderApiSpecPreview } from './apiSpecPreview';

// 自己完結の最小 API 設計書（日本語キー）。normalize→autofill→render の
// permissive パスを通す。深い検証は schema-api-spec / renderer-pdf 側の
// テストが担保するので、ここは配線の統合確認に絞る。
const MINIMAL_API_SPEC = `---
スキーマ: api-spec/v1
文書番号: API-TEST-001
タイトル: テスト注文 API
発行日: "2026-07-17"
作成者:
  - 名前: 開発チーム
エンドポイント:
  - メソッド: GET
    パス: /orders
    概要: 注文一覧を取得する
---
`;

const INVOICE_DOC = `---
schema: invoice
請求書番号: INV-001
---
`;

describe('renderApiSpecPreview', () => {
  it('API 設計書を iframe srcdoc（完全な HTML 文書）に変換する', () => {
    const result = renderApiSpecPreview(MINIMAL_API_SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc.startsWith('<!doctype html>')).toBe(true);
    // タイトルが cover に描画され、srcdoc に載る
    expect(result.srcdoc).toContain('テスト注文 API');
    // 文書 CSS がインライン化されている（api-spec のクラス接頭辞が CSS に含まれる）
    expect(result.srcdoc).toContain('mdb-api-spec');
    expect(result.documentTitle).toBe('テスト注文 API');
    expect(result.fatal).toBeUndefined();
  });

  it('theme を iframe 内 <html data-theme> まで貫通させる', () => {
    const result = renderApiSpecPreview(MINIMAL_API_SPEC, { theme: 'dark' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toMatch(/<html[^>]*data-theme="dark"/);
  });

  it('API 設計書でない文書は ok:false で理由を返す（誤描画しない）', () => {
    const result = renderApiSpecPreview(INVOICE_DOC);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBeTruthy();
  });

  it('frontmatter が無い文書も ok:false（API 設計書と誤認しない）', () => {
    const result = renderApiSpecPreview('# ただの Markdown\n\n本文のみ。');
    expect(result.ok).toBe(false);
  });
});
