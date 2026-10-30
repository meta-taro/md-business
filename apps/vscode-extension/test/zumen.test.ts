import { describe, expect, it, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { composeZumen, drawZumen } from '../src/preview/zumen.js';

const FIGURE = ['```zumen', 'version: 1', 'title: 注文の流れ', 'nodes: []', '```'].join('\n');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"></svg>';

describe('composeZumen', () => {
  it('構成図が無い文書は描き手を呼ばずにそのまま返す', async () => {
    const draw = vi.fn();
    const text = '# 見出し\n\n本文\n';
    await expect(composeZumen(text, draw)).resolves.toBe(text);
    expect(draw).not.toHaveBeenCalled();
  });

  it('囲みを画像へ替え、題名を説明と図の下の題名にする', async () => {
    const draw = vi.fn().mockResolvedValue(SVG);
    const out = await composeZumen(`前\n\n${FIGURE}\n\n後\n`, draw);

    expect(out).not.toContain('```zumen');
    expect(out).toMatch(/!\[注文の流れ\]\(data:image\/svg\+xml[^)]* "注文の流れ"\)/);
    expect(out.startsWith('前\n\n')).toBe(true);
    expect(out.endsWith('\n\n後\n')).toBe(true);
  });

  it('紙は白いので明るい配色で描く', async () => {
    const draw = vi.fn().mockResolvedValue(SVG);
    await composeZumen(FIGURE, draw);
    expect(draw).toHaveBeenCalledWith(expect.stringContaining('title: 注文の流れ'), {
      theme: 'light',
    });
  });

  it('描けなかったら理由を出し、書いた囲みはそのまま残す', async () => {
    const draw = vi.fn().mockRejectedValue(new Error('nodes の id が重複しています'));
    const out = await composeZumen(FIGURE, draw);

    expect(out).toContain('> 構成図を描けません。nodes の id が重複しています');
    expect(out).toContain(FIGURE);
  });

  it('CRLF の文書でも囲みを拾う', async () => {
    const draw = vi.fn().mockResolvedValue(SVG);
    const out = await composeZumen(`前\r\n\r\n${FIGURE.replace(/\n/g, '\r\n')}\r\n`, draw);
    expect(out).not.toContain('```zumen');
    expect(draw).toHaveBeenCalledTimes(1);
  });
});

describe('drawZumen', () => {
  it('基本設計書の雛形にある構成図を、拡張ホストの Node で描ける', async () => {
    const template = readFileSync(
      resolve(__dirname, '../../../templates/spec/standard-ja.md'),
      'utf8',
    );
    const out = await composeZumen(template, drawZumen);

    expect(out).not.toContain('```zumen');
    expect(out).not.toContain('構成図を描けません');
    expect(out).toContain('](data:image/svg+xml');
  }, 30_000);
});
