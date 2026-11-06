import { describe, it, expect } from 'vitest';
import { renderSheetPreview } from './testSpecTsv';

function sheet(lines: string[]): string {
  return ['#! md-business:test-spec-tsv/v1', ...lines].join('\n');
}

const HEADER = 'No.:number!\t項目:multiline!\t結果:enum(OK|NG|保留|未実施)!';

describe('検証シート（カスタム TSV）のプレビュー', () => {
  it('題名・メタ・列見出し・行を描く', () => {
    const r = renderSheetPreview(
      sheet(['# タイトル: ログインの検証', '# 文書番号: TEST-001', HEADER, '1\t開く\tOK']),
    );
    expect(r.ok).toBe(true);
    expect(r.documentTitle).toBe('ログインの検証');
    expect(r.srcdoc).toContain('ログインの検証');
    expect(r.srcdoc).toContain('TEST-001');
    expect(r.srcdoc).toContain('No.');
    expect(r.srcdoc).toContain('開く');
  });

  it('題名が無いシートも描ける（既定の呼び名になる）', () => {
    const r = renderSheetPreview(sheet([HEADER, '1\t開く\tOK']));
    expect(r.documentTitle).toBe('検証シート');
  });

  it('ペイン見出しは検証シート、書式 ID は test-spec-tsv', () => {
    const r = renderSheetPreview(sheet([HEADER, '1\t開く\tOK']));
    expect(r.label).toBe('検証シート');
    expect(r.style.id).toBe('test-spec-tsv');
  });

  it('完全な HTML 文書を返す（描画を止める知らせは持たない）', () => {
    const r = renderSheetPreview(sheet([HEADER, '1\t開く\tOK']));
    expect(r.srcdoc).toContain('<!doctype html>');
    expect(r.srcdoc).not.toContain('<link rel="stylesheet"');
    expect(r.warnings).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('CSS を外に出す指定なら埋め込まず link で読ませる', () => {
    const r = renderSheetPreview(sheet([HEADER, '1\t開く\tOK']), {
      cssHref: (id) => `../styles/${id}.css`,
    });
    expect(r.srcdoc).toContain('<link rel="stylesheet" href="../styles/test-spec-tsv.css">');
  });
});

describe('検証シートの用紙の向き', () => {
  it('既定は A4 横で、向きを切り替えられることを知らせる', () => {
    const r = renderSheetPreview(sheet([HEADER, '1\t開く\tOK']));
    expect(r.srcdoc).toContain('data-orientation="landscape"');
    expect(r.srcdoc).not.toContain('@page{size:A4 portrait}');
    expect(r.orientationAware).toBe(true);
  });

  it('縦を指定すると A4 縦で刷る', () => {
    const r = renderSheetPreview(sheet([HEADER, '1\t開く\tOK']), { orientation: 'portrait' });
    expect(r.srcdoc).toContain('data-orientation="portrait"');
    expect(r.srcdoc).toContain('@page{size:A4 portrait}');
  });
});
