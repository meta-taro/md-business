import { describe, it, expect } from 'vitest';
import {
  appendSample,
  summarize,
  formatReport,
  PERF_CAP,
  STATS_WINDOW,
  type PerfSample,
  type DocScale,
} from './perf';

function sample(at: number, spans: PerfSample['spans']): PerfSample {
  return { at, spans };
}

const scale: DocScale = {
  chars: 120_000,
  rows: 480,
  columns: 12,
  domRows: 480,
  historyChars: 2_400_000,
};

describe('appendSample', () => {
  it('新しいものが先頭に積まれる', () => {
    const s = appendSample(appendSample([], sample(1, { serialize: 3 })), sample(2, { serialize: 5 }));
    expect(s.map((x) => x.at)).toEqual([2, 1]);
  });

  it('上限を超えたぶんは古い側から落ちる', () => {
    let s: PerfSample[] = [];
    for (let i = 0; i < PERF_CAP + 10; i += 1) s = appendSample(s, sample(i, { serialize: i }));
    expect(s).toHaveLength(PERF_CAP);
    expect(s[0]?.at).toBe(PERF_CAP + 9);
    expect(s[s.length - 1]?.at).toBe(10);
  });

  it('元の配列を書き換えない', () => {
    const before: PerfSample[] = [sample(1, { serialize: 3 })];
    appendSample(before, sample(2, { serialize: 5 }));
    expect(before).toHaveLength(1);
  });
});

describe('summarize', () => {
  it('記録が無ければ空', () => {
    expect(summarize([])).toEqual([]);
  });

  it('記録された区間だけを返す', () => {
    const s = [sample(1, { serialize: 3, render: 8 })];
    expect(summarize(s).map((x) => x.name)).toEqual(['serialize', 'render']);
  });

  it('last は最も新しい値', () => {
    const s = [sample(2, { serialize: 9 }), sample(1, { serialize: 3 })];
    expect(summarize(s)[0]?.last).toBe(9);
  });

  it('中央値と最大を出す（奇数件）', () => {
    const s = [sample(3, { serialize: 1 }), sample(2, { serialize: 9 }), sample(1, { serialize: 5 })];
    const stats = summarize(s)[0];
    expect(stats?.median).toBe(5);
    expect(stats?.max).toBe(9);
    expect(stats?.count).toBe(3);
  });

  it('偶数件の中央値は中央 2 つの平均', () => {
    const s = [sample(2, { serialize: 2 }), sample(1, { serialize: 5 })];
    expect(summarize(s)[0]?.median).toBe(3.5);
  });

  it('区間ごとに直近 N 件だけを見る', () => {
    // 古い側に大きな値を置く。窓から外れるので max に出てこない。
    let s: PerfSample[] = [sample(0, { serialize: 999 })];
    for (let i = 1; i <= STATS_WINDOW; i += 1) s = appendSample(s, sample(i, { serialize: 1 }));
    const stats = summarize(s)[0];
    expect(stats?.count).toBe(STATS_WINDOW);
    expect(stats?.max).toBe(1);
  });

  it('たまにしか出ない区間も、その区間だけで直近 N 件を数える', () => {
    // save は 10 件に 1 度しか記録されない。窓が他の区間に食われない。
    let s: PerfSample[] = [];
    for (let i = 0; i < 40; i += 1) {
      s = appendSample(s, sample(i, i % 10 === 0 ? { serialize: 1, save: 20 } : { serialize: 1 }));
    }
    const save = summarize(s).find((x) => x.name === 'save');
    expect(save?.count).toBe(4);
    expect(save?.median).toBe(20);
  });
});

describe('formatReport', () => {
  const ctx = { version: '0.6.0', platform: 'windows', fileName: '07_高車管理.tsv', scale };

  it('版・環境・ファイル・規模・数字が入る', () => {
    const text = formatReport(ctx, summarize([sample(1, { serialize: 12.34, render: 5 })]));
    expect(text).toContain('0.6.0');
    expect(text).toContain('windows');
    expect(text).toContain('07_高車管理.tsv');
    expect(text).toContain('480');
    expect(text).toContain('serialize');
    expect(text).toContain('12.3');
  });

  it('記録が無くても規模だけは出る', () => {
    const text = formatReport(ctx, []);
    expect(text).toContain('480');
  });

  it('ファイルが開かれていなくても組める', () => {
    expect(() => formatReport({ ...ctx, fileName: null }, [])).not.toThrow();
  });
});
