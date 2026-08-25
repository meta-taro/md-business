// @vitest-environment jsdom
//
// 業務スキーマ非該当の Markdown は本文を sanitize（DOMPurify）して描くため window が要る。
import { describe, it, expect } from 'vitest';
import { buildStaticSite } from './staticSite';

const PLAIN = `# 覚書

本文。
`;

const SPEC = `---
schema: spec/v1
title: 基本設計書
---

# 基本設計書
`;

describe('buildStaticSite', () => {
  it('.md と同じ場所・同じ名前の .html を作る', async () => {
    const plan = await buildStaticSite([
      { path: '覚書.md', source: PLAIN },
      { path: '設計/基本設計書.md', source: SPEC },
    ]);

    expect(plan.pages).toEqual(['覚書.html', '設計/基本設計書.html']);
    expect(plan.skipped).toEqual([]);
  });

  it('ページは CSS を別ファイルとして読む（埋め込まない）', async () => {
    const plan = await buildStaticSite([{ path: '覚書.md', source: PLAIN }]);
    const page = plan.files.find((f) => f.path === '覚書.html');

    expect(page?.content).toContain('<link rel="stylesheet" href="assets/markdown.css">');
    expect(page?.content).not.toContain('<style>body');
    expect(plan.files.some((f) => f.path === 'assets/markdown.css')).toBe(true);
  });

  it('下の階層のページは CSS を上へ辿って読む', async () => {
    const plan = await buildStaticSite([{ path: '設計/詳細/仕様.md', source: PLAIN }]);
    const page = plan.files.find((f) => f.path === '設計/詳細/仕様.html');

    expect(page?.content).toContain('href="../../assets/markdown.css"');
  });

  it('同じ書式のページが CSS を共有する（1 本にまとまる）', async () => {
    const plan = await buildStaticSite([
      { path: 'a.md', source: PLAIN },
      { path: 'b.md', source: PLAIN },
      { path: 'c.md', source: SPEC },
    ]);

    const css = plan.files.filter((f) => f.path.startsWith('assets/'));
    expect(css.map((f) => f.path).sort()).toEqual(['assets/markdown.css', 'assets/spec.css']);
  });

  // href は Markdown を HTML にした時点で percent-encode されている（日本語の
  // ファイル名はここで %XX になる）。書き換えても、その形のまま保つ。
  it('文書どうしのリンクを .html へ書き換える', async () => {
    const plan = await buildStaticSite([
      { path: '索引.md', source: '# 索引\n\n[設計](./設計/基本設計書.md)\n' },
      { path: '設計/基本設計書.md', source: SPEC },
    ]);
    const page = plan.files.find((f) => f.path === '索引.html');

    expect(page?.content).toContain(`href="${encodeURI('./設計/基本設計書.html')}"`);
    expect(page?.content).not.toContain('.md"');
  });

  it('見出しの位置（#）を保ったまま書き換える', async () => {
    const plan = await buildStaticSite([
      { path: 'a.md', source: '# a\n\n[b の途中](./b.md#節)\n' },
      { path: 'b.md', source: PLAIN },
    ]);

    expect(plan.files.find((f) => f.path === 'a.html')?.content).toContain(
      `href="${encodeURI('./b.html#節')}"`,
    );
  });

  // 書き換えると、行った先が無いページになる。元のままなら少なくとも元の文書は開ける。
  it('サイトに無い .md へのリンクはそのまま残す', async () => {
    const plan = await buildStaticSite([{ path: 'a.md', source: '# a\n\n[外](./無い.md)\n' }]);

    expect(plan.files.find((f) => f.path === 'a.html')?.content).toContain(
      `href="${encodeURI('./無い.md')}"`,
    );
  });

  it('外部リンクには触らない', async () => {
    const plan = await buildStaticSite([
      { path: 'a.md', source: '# a\n\n[外](https://example.com/x.md)\n' },
    ]);

    expect(plan.files.find((f) => f.path === 'a.html')?.content).toContain(
      'href="https://example.com/x.md"',
    );
  });

  it('一覧のページを作る', async () => {
    const plan = await buildStaticSite([{ path: '設計/基本設計書.md', source: SPEC }], {
      title: '手元の文書',
    });
    const index = plan.files.find((f) => f.path === 'index.html');

    expect(index).toBeDefined();
    expect(index?.content).toContain('手元の文書');
    expect(index?.content).toContain('href="%E8%A8%AD%E8%A8%88/%E5%9F%BA%E6%9C%AC%E8%A8%AD%E8%A8%88%E6%9B%B8.html"');
    expect(index?.content).toContain('基本設計書');
  });

  // 自前の index.md がある方が、こちらが作る一覧より利用者の意図に近い。
  it('文書側に index.md があれば一覧で上書きしない', async () => {
    const plan = await buildStaticSite([{ path: 'index.md', source: PLAIN }]);

    expect(plan.files.filter((f) => f.path === 'index.html')).toHaveLength(1);
    expect(plan.files.find((f) => f.path === 'index.html')?.content).toContain('覚書');
  });

  it('プレビューが出せない文書は理由を添えて飛ばす', async () => {
    const plan = await buildStaticSite([
      { path: '壊れ.md', source: '---\n: : :\n---\n' },
      { path: '無事.md', source: PLAIN },
    ]);

    expect(plan.pages).toEqual(['無事.html']);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].path).toBe('壊れ.md');
    expect(plan.skipped[0].reason).not.toBe('');
  });

  it('.md でないものは受け付けない', async () => {
    const plan = await buildStaticSite([{ path: '検証.tsv', source: 'a\tb\n' }]);

    expect(plan.pages).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
  });

  // 単一 HTML 書き出しと同じ理由。受け取る側の環境は分からない。
  it('常に明るい配色で、プレビュー専用のスクリプトを含まない', async () => {
    const plan = await buildStaticSite([{ path: 'a.md', source: PLAIN }]);
    const page = plan.files.find((f) => f.path === 'a.html');

    expect(page?.content).toContain('data-theme="light"');
    expect(page?.content).not.toContain('parent.postMessage');
  });
});

describe('buildStaticSite — 画像', () => {
  it('画像はファイルとして運び、ページからはそこを指す', async () => {
    const plan = await buildStaticSite([
      { path: '経費/8月.md', source: '# 8 月\n\n![領収書](img/2026-08-19.png)\n' },
    ]);

    expect(plan.assets).toEqual([
      { src: '経費/img/2026-08-19.png', dest: 'assets/img/経費/img/2026-08-19.png' },
    ]);
    const page = plan.files.find((f) => f.path === '経費/8月.html');
    expect(page?.content).toContain('src="../assets/img/%E7%B5%8C%E8%B2%BB/img/2026-08-19.png"');
    expect(page?.content).not.toContain('data:image');
  });

  // 素の HTML は描画の手前（@md-business/core）で落ちるので、ページには出ない。
  // それでも「文書が指している画像」ではあるので、運ぶ側からは数える。
  it('HTML で書いた画像も運ぶ対象に数える', async () => {
    const plan = await buildStaticSite([{ path: 'a.md', source: '<img src="fig.png" alt="図">' }]);

    expect(plan.assets).toEqual([{ src: 'fig.png', dest: 'assets/img/fig.png' }]);
  });

  it('同じ画像を何度指しても運ぶのは 1 回', async () => {
    const plan = await buildStaticSite([
      { path: 'a.md', source: '![](fig.png)\n![](./fig.png)\n' },
      { path: 'b.md', source: '![](fig.png)\n' },
    ]);

    expect(plan.assets).toEqual([{ src: 'fig.png', dest: 'assets/img/fig.png' }]);
  });

  it('フォルダの外・外部の画像は運ばない', async () => {
    const plan = await buildStaticSite([
      { path: 'a.md', source: '![](../外.png)\n![](https://example.com/b.png)\n' },
    ]);

    expect(plan.assets).toEqual([]);
  });

  // web モードのページ。宣言と同意が揃ったときだけ、呼ぶ側が rawHtml を渡してくる。
  it('rawHtml で本文の script をそのまま載せる', async () => {
    const plan = await buildStaticSite([{ path: 'index.md', source: '# LP\n\n<script>go()</script>\n' }], {
      rawHtml: true,
    });

    const page = plan.files.find((f) => f.path === 'index.html');
    expect(page?.content).toContain('<script>go()</script>');
  });

  it('rawHtml を渡さなければ今までどおり落とす', async () => {
    const plan = await buildStaticSite([{ path: 'index.md', source: '# LP\n\n<script>go()</script>\n' }]);

    const page = plan.files.find((f) => f.path === 'index.html');
    expect(page?.content).not.toContain('go()');
  });
});

describe('buildStaticSite — 出来上がったページの制限', () => {
  const CSP = "default-src 'self' file:; script-src 'none'";

  /** ブラウザが読む値で見る（書き方の違いに引きずられないため）。 */
  function metaCsp(html: string): string | null {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content') ?? null;
  }

  it('組み立てたページに制限を焼き込む', async () => {
    const plan = await buildStaticSite([{ path: '覚書.md', source: PLAIN }], { csp: CSP });
    const page = plan.files.find((f) => f.path === '覚書.html');

    expect(metaCsp(page?.content ?? '')).toBe(CSP);
  });

  it('自動で作る一覧にも同じものを焼き込む', async () => {
    // 一覧は本文から作らない唯一のページ。ここが抜けると、最初に開く 1 枚だけ
    // 制限の外に出る。
    const plan = await buildStaticSite([{ path: '覚書.md', source: PLAIN }], { csp: CSP });
    const index = plan.files.find((f) => f.path === 'index.html');

    expect(index?.content).toContain('Content-Security-Policy');
  });

  it('焼き込むのはページだけで、CSS には触らない', async () => {
    const plan = await buildStaticSite([{ path: '覚書.md', source: PLAIN }], { csp: CSP });
    const css = plan.files.find((f) => f.path === 'assets/markdown.css');

    expect(css?.content).not.toContain('Content-Security-Policy');
  });

  it('制限は本文より先に置く（読み込みが始まる前に効かせる）', async () => {
    const plan = await buildStaticSite([{ path: '覚書.md', source: PLAIN }], { csp: CSP });
    const page = plan.files.find((f) => f.path === '覚書.html')?.content ?? '';

    expect(page.indexOf('Content-Security-Policy')).toBeLessThan(page.indexOf('<link rel='));
  });

  it('渡さなければ何も足さない（今までどおり）', async () => {
    const plan = await buildStaticSite([{ path: '覚書.md', source: PLAIN }]);

    expect(plan.files.every((f) => !f.content.includes('Content-Security-Policy'))).toBe(true);
  });
});
