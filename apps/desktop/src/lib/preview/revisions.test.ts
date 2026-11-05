// @vitest-environment jsdom
//
// 改版の印（{++追加++} {--削除--} {~~前~>後~~}）。プレビューがそのまま PDF になるので、
// 印を見せる版と清書の違いはプレビューの段階で出ていなければならない。
import { describe, it, expect } from 'vitest';
import { renderPreview } from './renderPreview';

const SPEC = [
  '---',
  'schemaVersion: spec/v1',
  'documentNumber: SPEC-001',
  'title: 決済',
  'version: 1.1.0',
  '---',
  '# 概要',
  '',
  '支払いは{--月末--}{++翌月 10 日++}に締める。',
  '',
  '# 改版履歴',
  '',
  '| 版 | 日付 | 内容 |',
  '| --- | --- | --- |',
  '| 1.0.0 | 2026-10-01 | 初版 |',
].join('\n');

const PLAIN = ['---', 'title: メモ', 'version: 2', '---', '# メモ', '', '{~~旧~>新~~}の手順。'].join('\n');

describe('改版の印', () => {
  it('既定は印を見せる版。追加は ins、削除は del で出る', async () => {
    const r = await renderPreview(SPEC);
    if (!r.ok) throw new Error(r.reason);
    expect(r.srcdoc).toContain('<ins class="mdb-ins">翌月 10 日</ins>');
    expect(r.srcdoc).toContain('<del class="mdb-del">月末</del>');
    expect(r.srcdoc).toContain('mdb-changed');
    expect(r.revisionAware).toBe(true);
  });

  it('清書は削除を落とし、追加を地の文として残す', async () => {
    const r = await renderPreview(SPEC, { revisions: 'clean' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.srcdoc).not.toContain('月末');
    expect(r.srcdoc).not.toContain('mdb-ins');
    expect(r.srcdoc).toContain('支払いは翌月 10 日に締める。');
  });

  it('印の無い文書では切り替えを出さない', async () => {
    const r = await renderPreview(SPEC.replace('{--月末--}{++翌月 10 日++}', '翌月 10 日'));
    if (!r.ok) throw new Error(r.reason);
    expect(r.revisionAware).toBe(false);
  });

  it('frontmatter の版が改版履歴に無ければ警告する', async () => {
    const r = await renderPreview(SPEC);
    if (!r.ok) throw new Error(r.reason);
    expect(r.warnings.join('\n')).toContain('1.1.0');
    const listed = await renderPreview(SPEC.replace('| 1.0.0 |', '| 1.1.0 |'));
    if (!listed.ok) throw new Error(listed.reason);
    expect(listed.warnings.join('\n')).not.toContain('改版履歴');
  });

  it('業務スキーマでない Markdown でも印を描き、清書にできる', async () => {
    const marked = await renderPreview(PLAIN);
    const clean = await renderPreview(PLAIN, { revisions: 'clean' });
    if (!marked.ok || !clean.ok) throw new Error('not ok');
    expect(marked.revisionAware).toBe(true);
    expect(marked.srcdoc).toContain('<del class="mdb-del">旧</del>');
    expect(clean.srcdoc).not.toContain('旧');
    expect(clean.srcdoc).toContain('新の手順。');
  });

  it('前の版と比べられるのは本文を地の文で書く文書だけ（印の有無は問わない）', async () => {
    const spec = await renderPreview(SPEC.replace('{--月末--}{++翌月 10 日++}', '翌月 10 日'));
    const plain = await renderPreview('# メモ\n\n本文。\n');
    const invoice = await renderPreview(['---', 'schemaVersion: invoice/v1', 'invoiceNumber: INV-1', '---', ''].join('\n'));
    if (!spec.ok || !plain.ok || !invoice.ok) throw new Error('not ok');
    expect(spec.comparable).toBe(true);
    expect(plain.comparable).toBe(true);
    expect(invoice.comparable).toBe(false);
  });
});

describe('記号のまま刷られる強調', () => {
  it('本文を描く文書では、閉じ忘れた ** をファイルの行番号で知らせる', async () => {
    const plain = await renderPreview('# メモ\n\n支払いは**月末に締める。\n');
    if (!plain.ok) throw new Error(plain.reason);
    expect(plain.warnings.join('\n')).toContain('3 行目');
  });

  it('本文を描かない書式（請求書）では知らせない', async () => {
    const invoice = await renderPreview(
      ['---', 'schemaVersion: invoice/v1', 'invoiceNumber: INV-1', '---', '', 'メモ**', ''].join('\n'),
    );
    if (!invoice.ok) throw new Error(invoice.reason);
    expect(invoice.warnings.join('\n')).not.toContain('「**」');
  });
});
