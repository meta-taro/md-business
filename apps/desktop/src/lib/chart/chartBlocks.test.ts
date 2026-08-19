import { describe, expect, it } from 'vitest';
import { collectChartBlocks, replaceChartBlocks } from './chartBlocks';

const FENCE = '```';
const TILDE = '~~~';

function chart(body = 'type: line\nsource: ./a.tsv\nx: 日付\ny: 数'): string {
  return `${FENCE}chart\n${body}\n${FENCE}`;
}

describe('本文から図の指定を拾う', () => {
  it('中身だけを取り出す', () => {
    const blocks = collectChartBlocks(`# 月報\n\n${chart()}\n\n本文`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].body).toBe('type: line\nsource: ./a.tsv\nx: 日付\ny: 数');
    expect(blocks[0].raw).toBe(chart());
  });

  it('ほかの言語の囲みは触らない', () => {
    expect(collectChartBlocks(`${FENCE}ts\nconst a = 1;\n${FENCE}`)).toEqual([]);
  });

  it('波線の囲みでも拾う', () => {
    const blocks = collectChartBlocks(`${TILDE}chart\ntype: pie\nsource: ./a.tsv\nx: 名\ny: 数\n${TILDE}`);
    expect(blocks).toHaveLength(1);
  });

  it('外側の囲みの中は指定ではなく見本', () => {
    const nested = `${TILDE}\n${chart()}\n${TILDE}`;
    expect(collectChartBlocks(nested)).toEqual([]);
  });

  it('閉じ忘れは末尾までを中身とする', () => {
    const blocks = collectChartBlocks(`${FENCE}chart\ntype: line`);
    expect(blocks[0].body).toBe('type: line');
  });

  it('同じ指定が 2 度出てきても 1 件にまとめる', () => {
    expect(collectChartBlocks(`${chart()}\n\n${chart()}`)).toHaveLength(1);
  });

  it('図が無ければ空', () => {
    expect(collectChartBlocks('ただの本文')).toEqual([]);
  });
});

describe('図の指定を描いたものに差し替える', () => {
  it('囲みごと置き換える', () => {
    const source = `前\n\n${chart()}\n\n後`;
    const out = replaceChartBlocks(source, new Map([[chart(), '<svg/>']]));
    expect(out).toBe('前\n\n<svg/>\n\n後');
  });

  it('同じ指定は出てくるところすべてで置き換える', () => {
    const source = `${chart()}\n\n${chart()}`;
    const out = replaceChartBlocks(source, new Map([[chart(), '<svg/>']]));
    expect(out).toBe('<svg/>\n\n<svg/>');
  });

  it('渡されなかった囲みはそのまま残す', () => {
    const source = chart();
    expect(replaceChartBlocks(source, new Map())).toBe(source);
  });
});
