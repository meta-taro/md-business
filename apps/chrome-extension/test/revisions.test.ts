import { describe, it, expect } from 'vitest';
import { loadMarkdown, previewMarkdown } from '../src/shared/loadMarkdown.js';

const SPEC = [
  '---',
  'schemaVersion: "spec/v1"',
  'documentNumber: "SPEC-1"',
  'title: "仕様"',
  'version: "1.1.0"',
  'issueDate: "2026-06-17"',
  'status: "draft"',
  'authors:',
  '  - name: "山田"',
  '---',
  '',
  '# 概要',
  '',
  '支払いは{--月末--}{++翌月 10 日++}に締める。',
  '',
  '# 改版履歴',
  '',
  '| 版 | 日付 | 内容 |',
  '| --- | --- | --- |',
  '| 1.0.0 | 2026-06-01 | 初版 |',
  '',
].join('\n');

describe('改版の印（印あり・清書）', () => {
  it('既定は印を見せる版で、追加は ins、削除は del になる', () => {
    const result = loadMarkdown(SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bodyHtml).toContain('<ins class="mdb-ins">翌月 10 日</ins>');
    expect(result.bodyHtml).toContain('<del class="mdb-del">月末</del>');
    expect(result.revisionAware).toBe(true);
  });

  it('清書は削除を落とし、追加を地の文として残す', () => {
    const result = loadMarkdown(SPEC, { revisions: 'clean' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bodyHtml).not.toContain('月末');
    expect(result.bodyHtml).not.toContain('mdb-ins');
    expect(result.bodyHtml).toContain('支払いは翌月 10 日に締める。');
  });

  it('下見でも清書を選べる', () => {
    const result = previewMarkdown(SPEC, { revisions: 'clean' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bodyHtml).not.toContain('月末');
    expect(result.revisionAware).toBe(true);
  });

  it('印の無い文書では切り替えを出さない', () => {
    const result = loadMarkdown(SPEC.replace('{--月末--}{++翌月 10 日++}', '翌月 10 日'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revisionAware).toBe(false);
  });

  it('frontmatter の版が改版履歴に無ければ警告する', () => {
    const missing = loadMarkdown(SPEC);
    const listed = loadMarkdown(SPEC.replace('| 1.0.0 |', '| 1.1.0 |'));
    expect(missing.ok && listed.ok).toBe(true);
    if (!missing.ok || !listed.ok) return;
    expect(missing.warnings.join('\n')).toContain('1.1.0');
    expect(listed.warnings.join('\n')).not.toContain('改版履歴');
    const preview = previewMarkdown(SPEC);
    if (!preview.ok) return;
    expect(preview.warnings.join('\n')).toContain('1.1.0');
  });
});

describe('記号のまま刷られる強調', () => {
  it('本文を描く書式では、閉じ忘れた ** を知らせる', () => {
    const result = loadMarkdown(SPEC.replace('に締める。', 'に**締める。'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.join('\n')).toContain('「**」');
    const preview = previewMarkdown(SPEC.replace('に締める。', 'に**締める。'));
    if (!preview.ok) return;
    expect(preview.warnings.join('\n')).toContain('「**」');
  });
});
