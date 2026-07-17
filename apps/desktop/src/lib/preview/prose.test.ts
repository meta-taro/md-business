// @vitest-environment jsdom
//
// prose スキーマ（spec / test-spec）は body を HTML 化・sanitize して描くため
// window（DOMPurify）が要る。この統合テストだけ jsdom に切り替える。データ駆動
// スキーマの renderPreview テスト（renderPreview.test.ts）は node のまま。
import { describe, it, expect } from 'vitest';
import { renderPreview } from './renderPreview';

describe('renderPreview — prose スキーマ（spec / test-spec）ルーティング', () => {
  it('spec を documentNumber マーカーで振り分け、本文を HTML 化して描く', () => {
    const md = [
      '---',
      'schemaVersion: spec/v1',
      'documentNumber: SPEC-001',
      'title: 決済基盤 基本設計書',
      '---',
      '# 概要',
      '',
      '本システムは決済を担う。',
    ].join('\n');
    const r = renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('基本設計書');
    expect(r.documentTitle).toContain('基本設計書');
    // 本文 Markdown が HTML 化されて srcdoc に載る。
    expect(r.srcdoc).toContain('概要');
    expect(r.srcdoc).toContain('本システムは決済を担う。');
  });

  it('spec 本文の <script> はサニタイズで落ちる（XSS 防御）', () => {
    const md = [
      '---',
      'schemaVersion: spec/v1',
      'documentNumber: SPEC-002',
      'title: XSS テスト',
      '---',
      '# 見出し',
      '',
      '<script>alert(1)</script>',
    ].join('\n');
    const r = renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.srcdoc).not.toContain('<script>alert(1)</script>');
    expect(r.srcdoc).not.toContain('alert(1)');
  });

  it('test-spec を columns マーカーで振り分ける', () => {
    const md = [
      '---',
      'schema: test-spec/v1',
      'documentNumber: TS-001',
      'title: ログイン検証シート',
      'columns: []',
      '---',
      '# 検証観点',
      '',
      '正常系と異常系を分ける。',
    ].join('\n');
    const r = renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('検証シート');
    expect(r.documentTitle).toContain('検証シート');
    expect(r.srcdoc).toContain('検証観点');
  });

  it('reviewers を共有していても test-spec 固有マーカー（列）があれば test-spec に行く', () => {
    // spec も reviewers を主張するが、列定義があれば厳格な test-spec が先に取る。
    const md = ['---', 'schema: test-spec/v1', '列: []', 'reviewers: []', '---', '本文'].join('\n');
    const r = renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('検証シート');
  });

  it('reviewers のみ（列定義なし）は spec が受け皿になる', () => {
    const md = ['---', 'reviewers: []', '---', '本文'].join('\n');
    const r = renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('基本設計書');
  });

  it('未完成 spec でも ok:true で描画し、検証エラーは側チャネルで返す', () => {
    const md = ['---', 'schemaVersion: spec/v1', 'chapters: []', '---', '# 下書き'].join('\n');
    const r = renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.srcdoc).toContain('<!doctype html>');
  });
});
