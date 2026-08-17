import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 起動して画面が出るまでの時間は、最初に読む JS を全部読み終わるまで動かない。
// エディタ一式（CodeMirror + 構文解析）はその中で最も大きく、実測で元ソース約 1.5MB。
// 静的 import に戻すと、まだ何も開いていない時点でこれを全部読むことになり、
// 起動が黙って重くなる（大きさは画面のどこにも出ないので気づけない）。
//
// 同じことが文書の描画側にも言える。6 スキーマぶんの検証器・文書 CSS・Markdown の
// 組み立て（と、その先の HTML 消毒）は、窓が出るまでに 1 つも要らない。
const PAGE = fileURLToPath(new URL('../../routes/+page.svelte', import.meta.url));
const LAYOUT = fileURLToPath(new URL('../../routes/+layout.svelte', import.meta.url));
const HTML_EXPORT = fileURLToPath(
  new URL('../preview/htmlExportController.svelte.ts', import.meta.url),
);
const IMAGE_EXPORT = fileURLToPath(
  new URL('../preview/imageExportController.svelte.ts', import.meta.url),
);
const SITE_EXPORT = fileURLToPath(
  new URL('../preview/siteExportController.svelte.ts', import.meta.url),
);
const BROWSER_PREVIEW = fileURLToPath(
  new URL('../preview/browserPreviewController.svelte.ts', import.meta.url),
);
const COLLECT_SITE = fileURLToPath(new URL('../preview/collectSite.ts', import.meta.url));

describe('起動時に読むもの', () => {
  const source = readFileSync(PAGE, 'utf8');
  const layout = readFileSync(LAYOUT, 'utf8');

  it('エディタ一式は静的 import しない', () => {
    expect(source).not.toMatch(/^\s*import\s+\w+\s+from\s+'\$lib\/editor\/CodeMirrorEditor\.svelte'/m);
  });

  it('エディタ一式は必要になってから読む', () => {
    expect(source).toMatch(/import\(\s*'\$lib\/editor\/CodeMirrorEditor\.svelte'\s*\)/);
  });

  it('プレビューの描画一式は静的 import しない', () => {
    expect(source).not.toMatch(/^\s*import\s+.*from\s+'\$lib\/preview\/renderPreview'/m);
  });

  it('図（Mermaid）は文書を開いてから読む', () => {
    expect(source).not.toMatch(/^\s*import\s+.*from\s+'\$lib\/preview\/renderMermaid'/m);
    expect(source).toMatch(/import\(\s*'\$lib\/preview\/renderMermaid'\s*\)/);
  });

  it('更新モーダルは出す段になってから読む', () => {
    expect(layout).not.toMatch(/^\s*import\s+\w+\s+from\s+'\$lib\/update\/UpdateDialog\.svelte'/m);
    expect(layout).toMatch(/import\(\s*'\$lib\/update\/UpdateDialog\.svelte'\s*\)/);
  });

  // 書き出しはどちらもプレビューと同じ描画一式を通る。コントローラは常に起動時に
  // 読まれるので、ここで静的 import に戻すとボタンを押さない起動でも全部読む。
  it('HTML 書き出しはボタンを押してから読む', () => {
    const controller = readFileSync(HTML_EXPORT, 'utf8');
    expect(controller).not.toMatch(/^\s*import\s+.*from\s+'\.\/htmlExport'/m);
    expect(controller).toMatch(/import\(\s*'\.\/htmlExport'\s*\)/);
  });

  // 画像書き出しも撮る中身は同じ描画一式。注文づくり（imageExport）は寸法の表だけなので
  // 起動時に読んでよいが、その先は押されるまで読まない。
  it('画像書き出しはボタンを押してから読む', () => {
    const controller = readFileSync(IMAGE_EXPORT, 'utf8');
    expect(controller).not.toMatch(/^\s*import\s+.*from\s+'\.\/htmlExport'/m);
    expect(controller).toMatch(/import\(\s*'\.\/htmlExport'\s*\)/);
  });

  // サイト書き出しとブラウザ表示は、同じ組み立て（collectSite）を通る。描画一式を
  // 読むのはそこ 1 か所なので、遅らせ方もそこで見る。
  it('サイトの組み立てはボタンを押してから読む', () => {
    const collect = readFileSync(COLLECT_SITE, 'utf8');
    expect(collect).not.toMatch(/^\s*import\s+(?!type\b).*from\s+'\.\/staticSite'/m);
    expect(collect).toMatch(/import\(\s*'\.\/staticSite'\s*\)/);
  });

  // ブラウザ表示のコントローラは、フォルダを開く経路から参照されるので必ず起動時に読まれる。
  it('サイト書き出し・ブラウザ表示は描画一式を静的 import しない', () => {
    for (const path of [SITE_EXPORT, BROWSER_PREVIEW]) {
      expect(readFileSync(path, 'utf8')).not.toMatch(
        /^\s*import\s+(?!type\b).*from\s+'\.\/staticSite'/m,
      );
    }
  });
});
