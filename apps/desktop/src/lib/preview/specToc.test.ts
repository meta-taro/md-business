// @vitest-environment jsdom
//
// 基本設計書の目次とマーカー。プレビューがそのまま PDF になるので、
// 本文の変換だけでなく、sanitize を通ったあとのプレビューに出ているかを見る。
import { describe, it, expect } from 'vitest';
import { renderPreview } from './renderPreview';

const spec = (extra: string): string =>
  [
    '---',
    'schemaVersion: spec/v1',
    'documentNumber: SPEC-001',
    'title: 決済',
    'version: 1.0.0',
    extra,
    '---',
    '# 概要',
    '',
    'ここを==読み上げる==。<u>下線</u>と<span style="color: blue">青</span>。',
    '',
    '## 構成',
  ].join('\n');

describe('基本設計書の目次', () => {
  it('目次表示: true で、見出しへのリンクを並べた目次を出す', async () => {
    const r = await renderPreview(spec('目次表示: true'));
    if (!r.ok) throw new Error(r.reason);
    expect(r.srcdoc).toContain('mdb-toc');
    expect(r.srcdoc).toContain('href="#構成"');
  });

  it('書かなければ目次を出さない', async () => {
    const r = await renderPreview(spec(''));
    if (!r.ok) throw new Error(r.reason);
    expect(r.srcdoc).not.toContain('class="mdb-toc"');
  });
});

describe('基本設計書のマーカー・下線・文字色', () => {
  it('社内版ではマーカー・下線・文字色が残る', async () => {
    const r = await renderPreview(spec(''));
    if (!r.ok) throw new Error(r.reason);
    expect(r.srcdoc).toContain('<mark class="mdb-mark">読み上げる</mark>');
    expect(r.srcdoc).toContain('<u>下線</u>');
    expect(r.srcdoc).toMatch(/<span style="color: blue;?">青<\/span>/);
  });

  it('提出版ではマーカーだけ外し、下線と文字色は残す', async () => {
    const r = await renderPreview(spec(''), { edition: 'submission' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.srcdoc).not.toContain('<mark');
    expect(r.srcdoc).toContain('ここを読み上げる。');
    expect(r.srcdoc).toContain('<u>下線</u>');
  });
});
