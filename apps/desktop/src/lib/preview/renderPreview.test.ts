import { describe, it, expect } from 'vitest';
import { renderPreview } from './renderPreview';
// 正本テンプレ（複製せず単一ソース）。valid な完成文書として errors=0 を検証する。
import apiSpecTemplate from '../../../../../templates/api-spec/standard-ja.md?raw';
import invoiceTemplate from '../../../../../templates/invoice/standard-ja.md?raw';

describe('renderPreview（オーケストレーター）', () => {
  it('api-spec 正本テンプレを描画し errors 0（label=API 設計書）', () => {
    const r = renderPreview(apiSpecTemplate);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('API 設計書');
    expect(r.errors).toEqual([]);
    expect(r.fatal).toBeUndefined();
    expect(r.srcdoc).toContain('<!doctype html>');
  });

  it('invoice 正本テンプレを描画し errors 0（label=請求書・schemaVersion 振り分け）', () => {
    const r = renderPreview(invoiceTemplate);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('請求書');
    expect(r.errors).toEqual([]);
    expect(r.documentTitle).toContain('請求書');
  });

  it('db-spec を schema prefix で振り分ける（tables マーカー）', () => {
    const r = renderPreview('---\nschema: db-spec/v1\ntables: []\n---\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('DB 設計書');
  });

  it('nosql-db-spec を schema prefix で振り分ける（collections マーカー）', () => {
    const r = renderPreview('---\nschema: nosql-db-spec/v1\ncollections: []\n---\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('NoSQL 設計書');
  });

  it('日本語マーカーのみ（schema/schemaVersion 無し）でも検出する（エンドポイント→API 設計書）', () => {
    const r = renderPreview('---\nエンドポイント: []\n---\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('API 設計書');
  });

  it('未完成文書でも ok:true で描画し、検証エラーは側チャネルで返す', () => {
    // endpoints だけの最小 api-spec。identity フィールド欠落で errors が付くが
    // 描画は止めない（permissive）。
    const r = renderPreview('---\nschema: api-spec/v1\nendpoints: []\n---\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.srcdoc).toContain('<!doctype html>');
  });

  it('対応スキーマ無しは not-applicable（理由付き）', () => {
    const r = renderPreview('---\nfoo: bar\n---\n本文だけ');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('対応するスキーマ');
  });

  it('frontmatter 解析不能は not-applicable（理由付き）', () => {
    const r = renderPreview('---\n: : : invalid yaml : :\n  - broken\n---\n');
    // gray-matter が throw する場合は解析不能理由、通る場合はスキーマ無し理由。
    expect(r.ok).toBe(false);
  });
});
