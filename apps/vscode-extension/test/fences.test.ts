import { describe, expect, it, vi } from 'vitest';

import { composeFences } from '../src/preview/fences.js';

const TABLE = ['月\t売上', '1月\t10', '2月\t20', ''].join('\n');
const CHART = ['```chart', 'type: bar', 'source: data/sales.tsv', 'x: 月', 'y: 売上', '```'].join('\n');
const DATA = ['```data', 'source: data/sales.tsv', '```'].join('\n');

describe('composeFences', () => {
  it('図もデータも無い文書は読まずにそのまま返す', async () => {
    const read = vi.fn();
    const text = '# 見出し\n';
    await expect(composeFences(text, { docPath: 'docs/a.md', read })).resolves.toBe(text);
    expect(read).not.toHaveBeenCalled();
  });

  it('図の囲みを画像へ、データの囲みを表へ替える（文書の場所から読む）', async () => {
    const read = vi.fn().mockResolvedValue(TABLE);
    const out = await composeFences(`${CHART}\n\n${DATA}\n`, { docPath: 'docs/a.md', read });

    expect(read).toHaveBeenCalledWith('docs/data/sales.tsv');
    expect(out).toMatch(/!\[[^\]]*\]\(data:image\/svg\+xml;base64,/);
    expect(out).toContain('| 月 | 売上 |');
    expect(out).not.toContain('```chart');
    expect(out).not.toContain('```data');
  });

  it('読めなければ理由を日本語で出し、書いた囲みは残す', async () => {
    const read = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const out = await composeFences(DATA, { docPath: 'docs/a.md', read });
    expect(out).toContain('データを表にできません');
    expect(out).toContain('source: data/sales.tsv');
  });

  it('フォルダを開いていなければ読みに行かず、理由を出す', async () => {
    const read = vi.fn();
    const out = await composeFences(CHART, { docPath: null, read });
    expect(read).not.toHaveBeenCalled();
    expect(out).toContain('図を描けません');
  });
});
