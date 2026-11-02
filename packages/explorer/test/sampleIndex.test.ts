import { describe, expect, it } from 'vitest';
import { readSampleIndex, searchSamples } from '../src/sampleIndex.js';

const index = {
  count: 3,
  categories: [
    {
      key: 'setsubi',
      label: '設備・電気',
      labelEn: 'Facilities and electrical',
      items: [
        { name: '06-家の電気系統', caption: '家の電気系統', captionEn: 'Home wiring', kind: 'placement', scales: 0, uses: ['wire'] },
        { name: '261-電源タップの定格', caption: '電源タップの定格', captionEn: 'Power strip rating', kind: 'placement', scales: 0, uses: [] },
      ],
    },
    {
      key: 'it',
      label: 'IT・ソフトウェア',
      labelEn: 'IT and software',
      items: [{ name: '01-オンプレのサーバ構成', caption: 'オンプレのサーバ構成', captionEn: 'On-prem servers', kind: 'graph', scales: 0, uses: [] }],
    },
  ],
};

describe('readSampleIndex', () => {
  it('分類ごとの図を平らな一覧にする', () => {
    const r = readSampleIndex(index);
    expect(r.samples.map((s) => s.name)).toEqual(['06-家の電気系統', '261-電源タップの定格', '01-オンプレのサーバ構成']);
    expect(r.samples[0]).toMatchObject({
      category: 'setsubi',
      categoryLabel: '設備・電気',
      file: '06-家の電気系統.zumen.yaml',
      uses: ['wire'],
    });
    expect(r.skipped).toBe(0);
    expect(r.truncated).toBe(false);
  });

  it('形が違う入力は空の一覧（投げない）', () => {
    expect(readSampleIndex(null).samples).toEqual([]);
    expect(readSampleIndex({ categories: 'x' }).samples).toEqual([]);
    expect(readSampleIndex({ categories: [null, { key: 'x' }] }).samples).toEqual([]);
  });

  it('ファイルの場所を外へ向けられる名前は捨てて数える', () => {
    const bad = {
      categories: [
        {
          key: 'x',
          label: 'x',
          items: [
            { name: '../../etc/passwd', caption: 'a' },
            { name: 'a/b', caption: 'a' },
            { name: 'a\\b', caption: 'a' },
            { name: '', caption: 'a' },
            { name: 'ok', caption: 'a' },
            { name: 'x\u0000y', caption: 'a' },
            { caption: 'no name' },
            'not an object',
          ],
        },
      ],
    };
    const r = readSampleIndex(bad);
    expect(r.samples.map((s) => s.name)).toEqual(['ok']);
    expect(r.skipped).toBe(7);
  });

  it('Windows の予約デバイス名・URL で意味を持つ文字・見えない文字を捨てる', () => {
    const names = ['CON', 'nul', 'Com1', 'LPT9', 'con.v2', 'a%2fb', 'a#b', 'a‮gnp', 'a​b', 'a﻿b', 'console'];
    const r = readSampleIndex({ categories: [{ key: 'x', label: 'x', items: names.map((name) => ({ name })) }] });
    expect(r.samples.map((s) => s.name)).toEqual(['console']);
  });

  it('UTF-8 で長すぎる名前は捨てる（ファイル名は 255 バイトまで）', () => {
    const r = readSampleIndex({ categories: [{ key: 'x', label: 'x', items: [{ name: 'あ'.repeat(80) }, { name: 'あ'.repeat(60) }] }] });
    expect(r.samples.map((s) => s.name.length)).toEqual([60]);
  });

  it('大文字小文字・正規化の違いだけの重複は後の方を捨てる（同じファイルになる）', () => {
    const r = readSampleIndex({
      categories: [{ key: 'x', label: 'x', items: [{ name: 'A' }, { name: 'a' }, { name: 'が' }, { name: 'が' }] }],
    });
    expect(r.samples.map((s) => s.name)).toEqual(['A', 'が']);
    expect(r.skipped).toBe(2);
  });

  it('caption が無ければ name を題名に使う', () => {
    const r = readSampleIndex({ categories: [{ key: 'x', label: 'x', items: [{ name: 'n1' }] }] });
    expect(r.samples[0]?.caption).toBe('n1');
  });

  it('長すぎる文字列は切り詰め、件数にも上限を置く', () => {
    const big = {
      categories: [
        { key: 'x', label: 'x', items: Array.from({ length: 20 }, (_, i) => ({ name: `n${i}`, caption: 'c'.repeat(5000) })) },
      ],
    };
    const r = readSampleIndex(big, { maxSamples: 10 });
    expect(r.samples).toHaveLength(10);
    expect(r.samples[0]?.caption.length).toBeLessThanOrEqual(500);
    expect(r.truncated).toBe(true);
  });
});

describe('searchSamples', () => {
  const { samples } = readSampleIndex(index);

  it('題名・分類名・英語の題名で当たる', () => {
    expect(searchSamples(samples, '電源').map((s) => s.name)).toEqual(['261-電源タップの定格']);
    expect(searchSamples(samples, '設備').map((s) => s.name)).toEqual(['06-家の電気系統', '261-電源タップの定格']);
    expect(searchSamples(samples, 'wiring').map((s) => s.name)).toEqual(['06-家の電気系統']);
  });

  it('題名の一致を分類名の一致より上に出す', () => {
    const hits = searchSamples(samples, '電気');
    expect(hits[0]?.name).toBe('06-家の電気系統');
  });

  it('カタカナ・ひらがなを区別しない', () => {
    expect(searchSamples(samples, 'さーば').map((s) => s.name)).toEqual(['01-オンプレのサーバ構成']);
  });

  it('空の検索語では何も返さない', () => {
    expect(searchSamples(samples, '')).toEqual([]);
  });

  it('上限で切る', () => {
    expect(searchSamples(samples, '設備', { limit: 1 })).toHaveLength(1);
  });
});
