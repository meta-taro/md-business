import { describe, expect, it, vi } from 'vitest';
import { composeFences } from '../src/shared/fences.js';

const SVG = '<svg width="10" height="10" viewBox="0 0 10 10"><rect /></svg>';

describe('composeFences', () => {
  it('returns a document without fences unchanged and never draws', async () => {
    const draw = vi.fn();
    const text = '# 見出し\n\n本文\n';
    expect(await composeFences(text, draw)).toBe(text);
    expect(draw).not.toHaveBeenCalled();
  });

  it('says the viewer cannot read sibling files instead of leaving a raw chart fence', async () => {
    const text = ['```chart', 'type: bar', 'source: data/sales.tsv', 'x: 月', 'y: 売上', '```', ''].join('\n');
    const out = await composeFences(text, vi.fn());
    expect(out).toContain('図を描けません。');
    expect(out).toContain('Chrome 拡張では隣のファイルを読めません（data/sales.tsv）');
    // 書いた指定は残す
    expect(out).toContain('source: data/sales.tsv');
  });

  it('says the same for a data fence', async () => {
    const text = ['```data', 'source: ../shared/list.tsv', '```', ''].join('\n');
    const out = await composeFences(text, vi.fn());
    expect(out).toContain('データを表にできません。');
    expect(out).toContain('Chrome 拡張では隣のファイルを読めません（../shared/list.tsv）');
  });

  it('keeps other spec problems worded as the other apps word them', async () => {
    const text = ['```chart', 'type: radar', 'source: a.tsv', 'x: a', 'y: b', '```', ''].join('\n');
    const out = await composeFences(text, vi.fn());
    expect(out).toContain('扱えない種類です（radar）');
  });

  it('draws a zumen fence inline, since the drawing is written in the document itself', async () => {
    const draw = vi.fn().mockResolvedValue(SVG);
    const text = ['```zumen', 'version: 1', 'title: 本番構成', '```', ''].join('\n');
    const out = await composeFences(text, draw);
    expect(draw).toHaveBeenCalledWith('version: 1\ntitle: 本番構成', { theme: 'light' });
    expect(out).toMatch(/^!\[本番構成\]\(data:image\/svg\+xml;base64,/);
    expect(out).not.toContain('```zumen');
  });

  it('shows why a zumen fence could not be drawn and keeps it', async () => {
    const draw = vi.fn().mockRejectedValue(new Error('nodes が空です'));
    const text = ['```zumen', 'version: 1', '```', ''].join('\n');
    const out = await composeFences(text, draw);
    expect(out).toContain('構成図を描けません。nodes が空です');
    expect(out).toContain('```zumen');
  });
});
