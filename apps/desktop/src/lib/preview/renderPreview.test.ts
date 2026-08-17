// @vitest-environment jsdom
//
// 業務スキーマ非該当は Markdown フォールバックへ回り、本文を HTML 化・sanitize
// （DOMPurify）して描くため window が要る。よって本ファイルは jsdom で回す
// （データ駆動スキーマの描画も jsdom 上で問題なく動く）。
import { describe, it, expect } from 'vitest';
import { renderPreview } from './renderPreview';
// 正本テンプレ（複製せず単一ソース）。valid な完成文書として errors=0 を検証する。
import apiSpecTemplate from '../../../../../templates/api-spec/standard-ja.md?raw';
import invoiceTemplate from '../../../../../templates/invoice/standard-ja.md?raw';
import quoteTemplate from '../../../../../templates/invoice/quote-ja.md?raw';
import receiptTemplate from '../../../../../templates/invoice/receipt-ja.md?raw';

describe('renderPreview（オーケストレーター）', () => {
  it('api-spec 正本テンプレを描画し errors 0（label=API 設計書）', async () => {
    const r = await renderPreview(apiSpecTemplate);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('API 設計書');
    expect(r.errors).toEqual([]);
    expect(r.fatal).toBeUndefined();
    expect(r.srcdoc).toContain('<!doctype html>');
  });

  it('invoice 正本テンプレを描画し errors 0（label=請求書・schemaVersion 振り分け）', async () => {
    const r = await renderPreview(invoiceTemplate);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('請求書');
    expect(r.errors).toEqual([]);
    expect(r.documentTitle).toContain('請求書');
  });

  it('見積書テンプレは同じ provider で描き、見出し・タイトルが 見積書 になる', async () => {
    const r = await renderPreview(quoteTemplate);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('見積書');
    expect(r.errors).toEqual([]);
    expect(r.documentTitle).toBe('見積書 EST-2026-0042');
  });

  it('領収書テンプレは同じ provider で描き、見出し・タイトルが 領収書 になる', async () => {
    const r = await renderPreview(receiptTemplate);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('領収書');
    expect(r.errors).toEqual([]);
    expect(r.documentTitle).toBe('領収書 RCP-2026-0042');
  });

  it('見積書番号 / 領収書番号 だけでも invoice provider に振り分ける', async () => {
    // 和名辞書がこれらを invoiceNumber の別名として受けるので、検出側も揃える。
    for (const [key, label] of [
      ['見積書番号', '見積書'],
      ['領収書番号', '領収書'],
    ]) {
      const r = await renderPreview(`---\n種別: ${label}\n${key}: X-1\n---\n`);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.label).toBe(label);
    }
  });

  it('db-spec を schema prefix で振り分ける（tables マーカー）', async () => {
    const r = await renderPreview('---\nschema: db-spec/v1\ntables: []\n---\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('DB 設計書');
  });

  it('nosql-db-spec を schema prefix で振り分ける（collections マーカー）', async () => {
    const r = await renderPreview('---\nschema: nosql-db-spec/v1\ncollections: []\n---\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('NoSQL 設計書');
  });

  it('日本語マーカーのみ（schema/schemaVersion 無し）でも検出する（エンドポイント→API 設計書）', async () => {
    const r = await renderPreview('---\nエンドポイント: []\n---\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('API 設計書');
  });

  it('未完成文書でも ok:true で描画し、検証エラーは側チャネルで返す', async () => {
    // endpoints だけの最小 api-spec。identity フィールド欠落で errors が付くが
    // 描画は止めない（permissive）。
    const r = await renderPreview('---\nschema: api-spec/v1\nendpoints: []\n---\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.srcdoc).toContain('<!doctype html>');
  });

  it('対応スキーマ無しは標準 Markdown フォールバックで描画する（label=Markdown）', async () => {
    // 業務スキーマに当たらない普通の .md（README 等）は空表示にせず素の Markdown を描く。
    const r = await renderPreview('---\nfoo: bar\n---\n# 見出し\n\n本文だけ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('Markdown');
    expect(r.srcdoc).toContain('見出し');
    expect(r.srcdoc).toContain('本文だけ');
  });

  it('frontmatter 完全に無いプレーン Markdown もフォールバックで描画する', async () => {
    const r = await renderPreview('# ただの README\n\n説明文。');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('Markdown');
    expect(r.srcdoc).toContain('ただの README');
  });

  it('frontmatter 解析不能は not-applicable（理由付き・フォールバックにも回さない）', async () => {
    const r = await renderPreview('---\n: : : invalid yaml : :\n  - broken\n---\n');
    // gray-matter が throw する解析不能ケースは、描画対象にできないため ok:false のまま。
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('解析できませんでした');
  });
});
