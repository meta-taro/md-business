import { describe, it, expect } from 'vitest';
import { loadMarkdown, previewMarkdown } from '../src/shared/loadMarkdown.js';

const SPEC = [
  '---',
  'schemaVersion: "spec/v1"',
  'documentNumber: "SPEC-1"',
  'title: "仕様"',
  'version: "1.0.0"',
  'issueDate: "2026-06-17"',
  'status: "draft"',
  'classification: "社外秘"',
  'fileName: "{区分}_{文書番号}"',
  'authors:',
  '  - name: "山田"',
  '---',
  '',
  '# 概要',
  '',
  '::: 社内',
  '社内だけの話',
  ':::',
  '',
  '残す本文。',
  '',
].join('\n');

const INVOICE = [
  '---',
  'schema: invoice/v1',
  'issuer:',
  '  name: 例示商店',
  'customer:',
  '  name: 得意先',
  'items:',
  '  - description: 保守',
  '    quantity: 1',
  '    unitPrice: 10000',
  '---',
  '',
].join('\n');

describe('版の出し分け（社内版・提出版）', () => {
  it('既定は社内版で、社内の囲みも区分もそのまま出す', () => {
    const result = loadMarkdown(SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bodyHtml).toContain('社内だけの話');
    expect(result.bodyHtml).toContain('社外秘');
    expect(result.pdfFileName).toBe('社外秘_SPEC-1');
    expect(result.editionAware).toBe(true);
  });

  it('提出版は囲みを落とし、区分と保存名を提出用にする', () => {
    const result = loadMarkdown(SPEC, { edition: 'submission' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bodyHtml).not.toContain('社内だけの話');
    expect(result.bodyHtml).toContain('残す本文。');
    expect(result.bodyHtml).toContain('提出用');
    expect(result.bodyHtml).not.toContain('社外秘');
    expect(result.pdfFileName).toBe('提出用_SPEC-1');
  });

  it('プレビューも同じ版で組む', () => {
    const result = previewMarkdown(SPEC, { edition: 'submission' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bodyHtml).not.toContain('社内だけの話');
    expect(result.editionAware).toBe(true);
  });

  it('提出版に残ったソースの場所を警告する（書き出しは止めない）', () => {
    const leaky = SPEC.replace('残す本文。', '修正は Service.php L12 で行った。');
    const result = loadMarkdown(leaky, { edition: 'submission' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.includes('Service.php L12'))).toBe(true);
    const internal = loadMarkdown(leaky);
    expect(internal.ok && internal.warnings.some((w) => w.includes('Service.php'))).toBe(false);
  });

  it('版を持たない文書では切り替えを出さない', () => {
    const result = loadMarkdown(INVOICE);
    expect(result.ok && result.editionAware).toBe(false);
    const preview = previewMarkdown(INVOICE);
    expect(preview.ok && preview.editionAware).toBe(false);
  });
});
