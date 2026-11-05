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
  // ショートカット処理を仕込む。Ctrl/Cmd+P・Ctrl/Cmd+S は親へ postMessage して、
  // 親の PDF 出力・保存を走らせる（iframe 内で処理できない穴を塞ぐ）。
  it('iframe 内ショートカット処理スクリプトを埋め込む（keydown を横取り）', () => {
    const html = buildPreviewDocument(base);
    expect(html).toContain('<script>');
    expect(html).toContain("addEventListener('keydown'");
    expect(html).toContain('preventDefault');
  });

  // iframe 自身で印刷すると、保存名がアプリの題名（md-business.pdf）になる。保存名を
  // 文書に合わせる処理は親が持っているので、親へ頼む。
  it('Ctrl/Cmd+P は親へ PDF を頼む（iframe 自身では印刷しない）', () => {
    const html = buildPreviewDocument(base);
    expect(html).toContain("post('pdf')");
    expect(html).not.toContain('window.print()');
  });

  it('Ctrl/Cmd+S は親へ保存を postMessage する（プロトコル source 付き）', () => {
    const html = buildPreviewDocument(base);
    expect(html).toContain('md-business-preview');
    expect(html).toContain('parent.postMessage');
  });
  // 書き出した HTML は画面の外へ出る。そこで keydown を横取りすると、
  // 受け取った人がブラウザで開いたときに印刷・検索の操作を奪う。
  it('shortcuts: false ならスクリプトを入れない', () => {
    const html = buildPreviewDocument({ ...base, shortcuts: false });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('parent.postMessage');
    // 本文と CSS はそのまま残る
    expect(html).toContain(base.bodyHtml);
    expect(html).toContain('.mdb-api-spec { color: red; }');
  });

  // 倍率は画面の上だけの話。印刷（PDF）は A4 の正本なので 100% のまま刷る。
  it('表示倍率は画面用の指定にだけ効かせる', () => {
    const html = buildPreviewDocument(base);
    expect(html).toMatch(/@media screen \{[^}]*zoom: var\(--preview-zoom, 1\)/);
  });

  it('倍率のキーと Ctrl+ホイールを親へ渡す', () => {
    const html = buildPreviewDocument(base);
    for (const action of ['zoomIn', 'zoomOut', 'zoomReset']) expect(html).toContain(`'${action}'`);
    expect(html).toContain("addEventListener('wheel'");
    expect(html).toContain('passive: false');
  });

  it('書き出す HTML には倍率の仕掛けを入れない', () => {
    expect(buildPreviewDocument({ ...base, shortcuts: false })).not.toContain('--preview-zoom');
  });

  // 静的サイトは同じ CSS を何十ページも抱えることになるので、そこだけ外に出す。
  it('cssHref を渡すと CSS を埋め込まず外部参照にする', () => {
    const html = buildPreviewDocument({ ...base, cssHref: '../assets/api-spec.css' });
    expect(html).toContain('<link rel="stylesheet" href="../assets/api-spec.css">');
    expect(html).not.toContain('.mdb-api-spec { color: red; }');
    // color-scheme の 1 行は文書ごとに変わるので残す
    expect(html).toContain('color-scheme: light');
  });

  it('cssHref も escape する', () => {
    const html = buildPreviewDocument({ ...base, cssHref: 'a"onload="x' });
    expect(html).not.toContain('onload="x');
  });
});

describe('buildPreviewDocument — 印刷の余白', () => {
  const base = {
    bodyHtml: '<section class="mdb-spec"><h1>設計書</h1></section>',
    css: '@page { margin: 20mm; } .mdb-spec { color: red; }',
  };
  const marginBoxes = /@media print\s*\{\s*@page\s*\{\s*@top-center\s*\{\s*content:\s*''\s*;?\s*\}\s*@bottom-center\s*\{\s*content:\s*''\s*;?\s*\}/;

  it('上下の余白に空の欄を置き、WebView が刷り込む URL とページ番号を出させない', () => {
    expect(buildPreviewDocument(base)).toMatch(marginBoxes);
  });

  it('文書の CSS より前に置く（文書が自分の欄を書けば、そちらが勝つ）', () => {
    const html = buildPreviewDocument(base);
    const ours = html.search(marginBoxes);
    expect(ours).toBeGreaterThan(-1);
    expect(ours).toBeLessThan(html.indexOf(base.css));
  });

  it('書き出す HTML にも入れる（ブラウザで開いて刷っても同じ）', () => {
    expect(buildPreviewDocument({ ...base, shortcuts: false })).toMatch(marginBoxes);
    expect(buildPreviewDocument({ ...base, cssHref: 'site.css' })).toMatch(marginBoxes);
  });
});
