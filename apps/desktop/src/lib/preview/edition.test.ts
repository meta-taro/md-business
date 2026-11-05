// @vitest-environment jsdom
//
// 1 つの正本から社内版と提出版を出し分ける。プレビューがそのまま PDF になるので、
// 版の違いはプレビューの段階で出ていなければならない。
import { describe, it, expect } from 'vitest';
import { renderPreview } from './renderPreview';

const SPEC = [
  '---',
  'schemaVersion: spec/v1',
  'documentNumber: SPEC-001',
  'title: 決済',
  'version: 1.0.0',
  'classification: 社外秘',
  'fileName: "{文書番号}_{区分}"',
  '---',
  '# 概要',
  '',
  '公開してよい説明。',
  '',
  '::: 社内',
  '実装メモ（社内だけ）。',
  ':::',
].join('\n');

describe('社内版と提出版', () => {
  it('既定は社内版。囲みは枠で出て、区分は社内のまま', async () => {
    const r = await renderPreview(SPEC);
    if (!r.ok) throw new Error(r.reason);
    expect(r.srcdoc).toContain('mdb-internal');
    expect(r.srcdoc).toContain('実装メモ（社内だけ）。');
    expect(r.srcdoc).toContain('社外秘');
    expect(r.pdfFileName).toBe('SPEC-001_社外秘');
    expect(r.editionAware).toBe(true);
  });

  it('提出版は囲みを落とし、区分を提出用にする（保存名も）', async () => {
    const r = await renderPreview(SPEC, { edition: 'submission' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.srcdoc).not.toContain('実装メモ');
    expect(r.srcdoc).not.toContain('社外秘');
    expect(r.srcdoc).toContain('提出用');
    expect(r.srcdoc).toContain('公開してよい説明。');
    expect(r.pdfFileName).toBe('SPEC-001_提出用');
  });

  it('提出版では囲みの外に残ったソースの場所を警告に出す（社内版では出さない）', async () => {
    const src = SPEC.replace('公開してよい説明。', '参照: src/order/Service.php L12');
    const internal = await renderPreview(src);
    const submission = await renderPreview(src, { edition: 'submission' });
    if (!internal.ok || !submission.ok) throw new Error('not ok');
    expect(internal.warnings.join('\n')).not.toContain('Service.php');
    expect(submission.warnings.join('\n')).toContain('Service.php L12');
  });

  it('基本設計書は囲みが無くても版を選べる（区分が版で変わるため）', async () => {
    const r = await renderPreview(SPEC.replace(/::: 社内[\s\S]*$/, ''));
    if (!r.ok) throw new Error(r.reason);
    expect(r.editionAware).toBe(true);
  });

  it('素の Markdown は囲みがあるときだけ版を選べ、提出版で囲みが落ちる', async () => {
    const plain = '# メモ\n\n公開。\n\n::: 社内\n内緒。\n:::\n';
    const internal = await renderPreview(plain);
    const submission = await renderPreview(plain, { edition: 'submission' });
    if (!internal.ok || !submission.ok) throw new Error('not ok');
    expect(internal.editionAware).toBe(true);
    expect(internal.srcdoc).toContain('内緒。');
    expect(submission.srcdoc).not.toContain('内緒。');

    const none = await renderPreview('# メモ\n\n公開。\n');
    if (!none.ok) throw new Error(none.reason);
    expect(none.editionAware).toBe(false);
  });

  it('囲みを持たない書式（請求書）は版を選ばせない', async () => {
    const r = await renderPreview(['---', 'schemaVersion: invoice/v1', 'invoiceNumber: INV-1', '---', ''].join('\n'));
    if (!r.ok) throw new Error(r.reason);
    expect(r.editionAware).toBe(false);
  });
});
