import { describe, it, expect } from 'vitest';
import { buildPreviewDocument } from './previewDocument';

describe('buildPreviewDocument', () => {
  const base = {
    bodyHtml: '<section class="mdb-api-spec"><h1>注文 API</h1></section>',
    css: '.mdb-api-spec { color: red; }',
    title: '注文 API 設計書',
  };

  it('doctype で始まる完全な HTML 文書を返す', () => {
    const html = buildPreviewDocument(base);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  it('body 断片をそのまま <body> に埋め込む（二重エスケープしない）', () => {
    const html = buildPreviewDocument(base);
    expect(html).toContain(base.bodyHtml);
    // body 内容は renderer-pdf 側で escape 済みの断片なので、そのまま入る
    expect(html).toContain('<body');
  });

  it('CSS を <style> でインライン化する（外部参照にしない）', () => {
    const html = buildPreviewDocument(base);
    expect(html).toContain('<style>');
    expect(html).toContain('.mdb-api-spec { color: red; }');
    expect(html).not.toContain('<link');
  });

  it('title を <title> に入れつつ HTML エスケープする', () => {
    const html = buildPreviewDocument({
      ...base,
      title: '<script>alert(1)</script> & "危険"',
    });
    expect(html).toContain(
      '<title>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;危険&quot;</title>',
    );
    // 生の <script> がタイトル由来で混入しない
    expect(html).not.toContain('<title><script>');
  });

  it('theme を iframe 内 <html data-theme> に刻印する（別ドキュメントなので継承されない）', () => {
    const dark = buildPreviewDocument({ ...base, theme: 'dark' });
    expect(dark).toMatch(/<html[^>]*data-theme="dark"/);
    const light = buildPreviewDocument({ ...base, theme: 'light' });
    expect(light).toMatch(/<html[^>]*data-theme="light"/);
  });

  it('theme 未指定なら light を既定にする', () => {
    const html = buildPreviewDocument(base);
    expect(html).toMatch(/<html[^>]*data-theme="light"/);
  });

  it('color-scheme を theme に一致させる（ダークで白いスクロールバーを残さない）', () => {
    // iframe 内のネイティブ UI（スクロールバー等）をテーマへ追従させる。data-theme だけでは
    // WebView がライトのスクロールバーを描くため、color-scheme も刻む必要がある。
    expect(buildPreviewDocument({ ...base, theme: 'dark' })).toContain('color-scheme: dark');
    expect(buildPreviewDocument({ ...base, theme: 'light' })).toContain('color-scheme: light');
    // 既定（未指定）は light。
    expect(buildPreviewDocument(base)).toContain('color-scheme: light');
  });

  it('lang は既定 ja、指定で上書きできる', () => {
    expect(buildPreviewDocument(base)).toMatch(/<html[^>]*lang="ja"/);
    expect(buildPreviewDocument({ ...base, lang: 'en' })).toMatch(/<html[^>]*lang="en"/);
  });

  it('charset utf-8 と viewport の meta を含む', () => {
    const html = buildPreviewDocument(base);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
  });

  // iframe にフォーカスがある状態の Ctrl+P は親 window へ伝播しないため、iframe 自身にも
  // ショートカット処理を仕込む。Ctrl/Cmd+P はプレビュー自身を印刷（アプリ全体でなく）、
  // Ctrl/Cmd+S は親へ postMessage して保存させる（DOC-SPEC §6.4 の穴を塞ぐ）。
  it('iframe 内ショートカット処理スクリプトを埋め込む（keydown を横取り）', () => {
    const html = buildPreviewDocument(base);
    expect(html).toContain('<script>');
    expect(html).toContain("addEventListener('keydown'");
    expect(html).toContain('preventDefault');
  });

  it('Ctrl/Cmd+P は iframe 自身を印刷する（window.print）', () => {
    const html = buildPreviewDocument(base);
    expect(html).toContain('window.print()');
  });

  it('Ctrl/Cmd+S は親へ保存を postMessage する（プロトコル source 付き）', () => {
    const html = buildPreviewDocument(base);
    expect(html).toContain('md-business-preview');
    expect(html).toContain('parent.postMessage');
  });
});
