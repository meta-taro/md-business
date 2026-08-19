import { describe, expect, it } from 'vitest';
import { buildChartData, parseDataTable } from './chartData';

const TSV = ['日付\tセッション\tユーザー', '2026-08-01\t120\t80', '2026-08-02\t140\t95'].join('\n');

describe('数字の表を読む', () => {
  it('見出しと行に分ける', () => {
    expect(parseDataTable(TSV)).toEqual({
      columns: ['日付', 'セッション', 'ユーザー'],
      rows: [
        ['2026-08-01', '120', '80'],
        ['2026-08-02', '140', '95'],
      ],
    });
  });

  it('覚え書きの行と空行は読み飛ばす', () => {
    const table = parseDataTable(`# 取得日時 2026-08-03\n\n${TSV}\n\n`);
    expect(table.columns).toEqual(['日付', 'セッション', 'ユーザー']);
    expect(table.rows).toHaveLength(2);
  });

  it('列が足りない行は空欄で埋める', () => {
    const table = parseDataTable(`${TSV}\n2026-08-03\t160`);
    expect(table.rows[2]).toEqual(['2026-08-03', '160', '']);
  });

  it('何も無ければ列も行も空', () => {
    expect(parseDataTable('  \n\n')).toEqual({ columns: [], rows: [] });
  });
});

describe('表から図の元を作る', () => {
  const table = parseDataTable(TSV);

  it('横軸と値の列を取り出す', () => {
    const result = buildChartData(table, { x: '日付', y: ['セッション'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.labels).toEqual(['2026-08-01', '2026-08-02']);
    expect(result.data.series).toEqual([{ name: 'セッション', values: [120, 140] }]);
    expect(result.data.unreadable).toBe(0);
  });

  it('値の列は複数取れる', () => {
    const result = buildChartData(table, { x: '日付', y: ['セッション', 'ユーザー'] });
    expect(result.ok && result.data.series.map((s) => s.name)).toEqual(['セッション', 'ユーザー']);
  });

  it('空欄は 0 にせず空けたまま', () => {
    const gapped = parseDataTable(`${TSV}\n2026-08-03\t\t70`);
    const result = buildChartData(gapped, { x: '日付', y: ['セッション'] });
    expect(result.ok && result.data.series[0].values).toEqual([120, 140, null]);
    expect(result.ok && result.data.unreadable).toBe(0);
  });

  it('桁区切りは数として読む', () => {
    const table2 = parseDataTable('日付\tセッション\n2026-08-01\t1,234');
    expect(buildChartData(table2, { x: '日付', y: ['セッション'] })).toMatchObject({
      ok: true,
      data: { series: [{ values: [1234] }] },
    });
  });

  it('数として読めないセルは空けたうえで数える', () => {
    const table2 = parseDataTable('日付\tセッション\n2026-08-01\t不明\n2026-08-02\t140');
    const result = buildChartData(table2, { x: '日付', y: ['セッション'] });
    expect(result.ok && result.data.series[0].values).toEqual([null, 140]);
    expect(result.ok && result.data.unreadable).toBe(1);
  });

  it('横軸の列が無い', () => {
    const result = buildChartData(table, { x: '週', y: ['セッション'] });
    expect(result).toEqual({ ok: false, problem: { kind: 'no-column', raw: '週' } });
  });

  it('値の列が無い', () => {
    const result = buildChartData(table, { x: '日付', y: ['セッション', '直帰率'] });
    expect(result).toEqual({ ok: false, problem: { kind: 'no-column', raw: '直帰率' } });
  });

  it('行が 1 つも無い', () => {
    const result = buildChartData(parseDataTable('日付\tセッション'), {
      x: '日付',
      y: ['セッション'],
    });
    expect(result).toEqual({ ok: false, problem: { kind: 'no-rows', raw: '' } });
  });

  it('全部空欄なら描く数字が無い', () => {
    const result = buildChartData(parseDataTable('日付\tセッション\n2026-08-01\t'), {
      x: '日付',
      y: ['セッション'],
    });
    expect(result).toEqual({ ok: false, problem: { kind: 'no-numbers', raw: 'セッション' } });
  });
});
