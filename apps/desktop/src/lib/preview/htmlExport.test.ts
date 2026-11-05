// @vitest-environment jsdom
//
// 業務スキーマ非該当の Markdown は本文を sanitize（DOMPurify）して描くため window が要る。
import { describe, it, expect } from 'vitest';
import { buildExportHtml } from './htmlExport';

const INVOICE = `---
schema: invoice/v1
issuer:
  name: 例示商店
customer:
  name: 得意先
items:
  - description: 保守
    quantity: 1
    unitPrice: 10000
---
`;

const PLAIN = `---
title: ただの覚書
---

# 見出し

本文。
`;

describe('buildExportHtml', () => {
  it('プレビューと同じ完全な HTML 文書を返す', async () => {
    const html = await buildExportHtml(INVOICE);
    expect(html).not.toBeNull();
    expect(html?.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    // 文書 CSS が埋め込まれている（外部参照にしない＝1 ファイルで完結する）
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link');
  });

  // 送った先で keydown を横取りすると、相手のブラウザの印刷・検索が奪われる。
  it('プレビュー専用のスクリプトを含まない', async () => {
    const html = await buildExportHtml(INVOICE);
    expect(html).not.toContain('parent.postMessage');
    expect(html).not.toContain('<script>');
  });

  // 受け取る側の環境は分からないし、印刷すれば地は白になる。
  // テーマを引数で受け取らないので、アプリ側の配色が書き出しへ漏れようがない。
  it('常に明るい配色で書き出す', async () => {
    const html = await buildExportHtml(INVOICE);
    expect(html).toContain('data-theme="light"');
    expect(html).not.toContain('data-theme="dark"');
  });

  it('業務スキーマでない Markdown も書き出せる', async () => {
    const html = await buildExportHtml(PLAIN);
    expect(html).toContain('見出し');
  });

  // 画面で提出版を確かめて書き出したのに、社内の囲みが残って出るのを防ぐ。
  it('渡された版で組む（提出版は社内の囲みを落とす）', async () => {
    const doc = ['# 見出し', '', '::: 社内', '社内だけの話', ':::', ''].join('\n');
    expect(await buildExportHtml(doc)).toContain('社内だけの話');
    expect(await buildExportHtml(doc, 'submission')).not.toContain('社内だけの話');
  });

  it('frontmatter が壊れていれば null（押せるボタンにしない）', async () => {
    await expect(buildExportHtml('---\n: : :\n---\n')).resolves.toBeNull();
  });
});

describe('buildExportHtml の改版の印', () => {
  const MARKED = ['---', 'title: メモ', '---', '# メモ', '', '{~~旧~>新~~}の手順。'].join('\n');

  it('画面で清書を選んでいれば、書き出しも清書になる', async () => {
    const marked = await buildExportHtml(MARKED);
    const clean = await buildExportHtml(MARKED, 'internal', 'clean');
    expect(marked).toContain('<del class="mdb-del">旧</del>');
    expect(clean).not.toContain('旧');
    expect(clean).toContain('新の手順。');
  });
});
