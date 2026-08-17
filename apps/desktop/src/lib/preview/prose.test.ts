// @vitest-environment jsdom
//
// prose スキーマ（spec / test-spec）は body を HTML 化・sanitize して描くため
// window（DOMPurify）が要る。この統合テストだけ jsdom に切り替える。データ駆動
// スキーマの renderPreview テスト（renderPreview.test.ts）は node のまま。
import { describe, it, expect } from 'vitest';
import { renderPreview } from './renderPreview';

// 64 桁の 16 進。数字だけにすると YAML が数値として読むので、実物と同じく英字を混ぜる。
const SHA256 = 'ab12cd34'.repeat(8);

describe('renderPreview — prose スキーマ（spec / test-spec）ルーティング', () => {
  it('spec を documentNumber マーカーで振り分け、本文を HTML 化して描く', async () => {
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
    const r = await renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('基本設計書');
    expect(r.documentTitle).toContain('基本設計書');
    // 本文 Markdown が HTML 化されて srcdoc に載る。
    expect(r.srcdoc).toContain('概要');
    expect(r.srcdoc).toContain('本システムは決済を担う。');
  });

  it('spec 本文の <script> はサニタイズで落ちる（XSS 防御）', async () => {
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
    const r = await renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.srcdoc).not.toContain('<script>alert(1)</script>');
    expect(r.srcdoc).not.toContain('alert(1)');
  });

  it('investigation を schema prefix で振り分け、本文を HTML 化して描く', async () => {
    const md = [
      '---',
      'schema: investigation/v1',
      'kind: log',
      'documentNumber: INV-001',
      'title: 認証失敗急増の調査',
      'createdAt: "2026-08-12T09:30:00+09:00"',
      'status: investigating',
      'authors:',
      '  - name: 調査担当',
      'targets:',
      `  - path: logs/app.jsonl`,
      `    sha256: ${SHA256}`,
      'tools:',
      '  - name: md-business',
      '    version: "0.9.0"',
      'window:',
      '  from: "2026-08-11T00:00:00+09:00"',
      '  to: "2026-08-12T00:00:00+09:00"',
      '---',
      '## 結論',
      '',
      '送信元 IP の素性が判明するまで断定しない。',
    ].join('\n');
    const r = await renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('調査報告書');
    expect(r.documentTitle).toBe('認証失敗急増の調査');
    expect(r.errors).toEqual([]);
    // ダイジェストは 64 桁のまま出す（後から同じファイルか確かめる唯一の手掛かり）。
    expect(r.srcdoc).toContain(SHA256);
    // 経緯・調べ方・結論は本文にしか無いので、本文が落ちると報告書にならない。
    expect(r.srcdoc).toContain('結論');
    expect(r.srcdoc).toContain('送信元 IP の素性が判明するまで断定しない。');
  });

  it('investigation 本文の <script> はサニタイズで落ちる', async () => {
    const md = [
      '---',
      'schema: investigation/v1',
      'documentNumber: INV-002',
      'title: XSS テスト',
      '---',
      '<script>alert(1)</script>',
    ].join('\n');
    const r = await renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.srcdoc).not.toContain('alert(1)');
  });

  it('日本語だけの調査報告書も所見マーカーで振り分ける', async () => {
    const md = ['---', '所見: []', 'タイトル: 通信調査', '---', '# 通信調査'].join('\n');
    const r = await renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('調査報告書');
  });

  it('test-spec を columns マーカーで振り分ける', async () => {
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
    const r = await renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('検証シート');
    expect(r.documentTitle).toContain('検証シート');
    expect(r.srcdoc).toContain('検証観点');
  });

  it('reviewers を共有していても test-spec 固有マーカー（列）があれば test-spec に行く', async () => {
    // spec も reviewers を主張するが、列定義があれば厳格な test-spec が先に取る。
    const md = ['---', 'schema: test-spec/v1', '列: []', 'reviewers: []', '---', '本文'].join('\n');
    const r = await renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('検証シート');
  });

  it('reviewers のみ（列定義なし）は spec が受け皿になる', async () => {
    const md = ['---', 'reviewers: []', '---', '本文'].join('\n');
    const r = await renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('基本設計書');
  });

  it('未完成 spec でも ok:true で描画し、検証エラーは側チャネルで返す', async () => {
    const md = ['---', 'schemaVersion: spec/v1', 'chapters: []', '---', '# 下書き'].join('\n');
    const r = await renderPreview(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.srcdoc).toContain('<!doctype html>');
  });
});
