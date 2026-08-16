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
  it('プレビューと同じ完全な HTML 文書を返す', () => {
    const html = buildExportHtml(INVOICE);
    expect(html).not.toBeNull();
    expect(html?.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    // 文書 CSS が埋め込まれている（外部参照にしない＝1 ファイルで完結する）
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link');
  });

  // 送った先で keydown を横取りすると、相手のブラウザの印刷・検索が奪われる。
  it('プレビュー専用のスクリプトを含まない', () => {
    const html = buildExportHtml(INVOICE);
    expect(html).not.toContain('parent.postMessage');
    expect(html).not.toContain('<script>');
  });

  // 受け取る側の環境は分からないし、印刷すれば地は白になる。
  // テーマを引数で受け取らないので、アプリ側の配色が書き出しへ漏れようがない。
  it('常に明るい配色で書き出す', () => {
    const html = buildExportHtml(INVOICE);
    expect(html).toContain('data-theme="light"');
    expect(html).not.toContain('data-theme="dark"');
  });

  it('業務スキーマでない Markdown も書き出せる', () => {
    const html = buildExportHtml(PLAIN);
    expect(html).toContain('見出し');
  });

  it('frontmatter が壊れていれば null（押せるボタンにしない）', () => {
    expect(buildExportHtml('---\n: : :\n---\n')).toBeNull();
  });
});
