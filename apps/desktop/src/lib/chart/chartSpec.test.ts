import { describe, expect, it } from 'vitest';
import { parseChartSpec } from './chartSpec';

/** 通る指定を組み立てる。個々のテストは変えたいところだけ差す。 */
function block(over: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    type: 'line',
    source: './analytics/2026-08.tsv',
    x: '日付',
    y: 'セッション',
    ...over,
  };
  return Object.entries(base)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

describe('図の指定を読む', () => {
  it('種類・出どころ・軸を取り出す', () => {
    const result = parseChartSpec(block());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec).toEqual({
      type: 'line',
      source: './analytics/2026-08.tsv',
      x: '日付',
      y: ['セッション'],
      title: null,
    });
  });

  it('題名を添えられる', () => {
    const result = parseChartSpec(block({ title: 'セッション推移' }));
    expect(result.ok && result.spec.title).toBe('セッション推移');
  });

  it('値の列は読点で並べられる', () => {
    const result = parseChartSpec(block({ y: 'セッション, ユーザー ,直帰率' }));
    expect(result.ok && result.spec.y).toEqual(['セッション', 'ユーザー', '直帰率']);
  });

  it('値に含まれる区切りは残す（時刻など）', () => {
    const result = parseChartSpec(block({ title: '9:00 の推移' }));
    expect(result.ok && result.spec.title).toBe('9:00 の推移');
  });

  it('空行と覚え書きは読み飛ばす', () => {
    const result = parseChartSpec(`# 月次\n\n${block()}\n`);
    expect(result.ok).toBe(true);
  });

  it('棒と円も選べる', () => {
    expect(parseChartSpec(block({ type: 'bar' })).ok).toBe(true);
    expect(parseChartSpec(block({ type: 'pie' })).ok).toBe(true);
  });
});

describe('図の指定が通らないとき', () => {
  it('中身が空', () => {
    const result = parseChartSpec('  \n\n');
    expect(result).toEqual({ ok: false, problem: { kind: 'empty', raw: '', line: null } });
  });

  it('区切りが無い行', () => {
    const result = parseChartSpec(`${block()}\nセッション推移`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toEqual({ kind: 'syntax', raw: 'セッション推移', line: 5 });
  });

  it('知らない指定', () => {
    const result = parseChartSpec(block({ colour: 'red' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('unknown-key');
    expect(result.problem.raw).toBe('colour');
  });

  it('同じ指定が 2 回', () => {
    const result = parseChartSpec(`${block()}\nx: 週`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toEqual({ kind: 'duplicate-key', raw: 'x', line: 5 });
  });

  it('知らない種類', () => {
    const result = parseChartSpec(block({ type: 'donut' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toEqual({ kind: 'bad-type', raw: 'donut', line: 1 });
  });

  it('出どころが無い', () => {
    const result = parseChartSpec('type: line\nx: 日付\ny: セッション');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toEqual({ kind: 'missing', raw: 'source', line: null });
  });

  it('値の列が空', () => {
    const result = parseChartSpec(block({ y: ' , ' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toEqual({ kind: 'missing', raw: 'y', line: null });
  });

  it('足りない指定は最初の 1 つだけ言う', () => {
    const result = parseChartSpec('type: line');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.raw).toBe('source');
  });
});
