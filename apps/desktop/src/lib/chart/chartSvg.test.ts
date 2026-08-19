import { describe, expect, it } from 'vitest';
import { renderChartSvg } from './chartSvg';
import type { ChartData } from './chartData';

function data(over: Partial<ChartData> = {}): ChartData {
  return {
    labels: ['1日', '2日', '3日'],
    series: [{ name: 'セッション', values: [120, 140, 90] }],
    unreadable: 0,
    ...over,
  };
}

/** 属性や要素の数を数える。 */
function count(svg: string, pattern: RegExp): number {
  return svg.match(pattern)?.length ?? 0;
}

describe('図を描く', () => {
  it('大きさの決まった SVG を返す', () => {
    const svg = renderChartSvg(data(), { type: 'line' });
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg).toContain('viewBox="0 0 640 320"');
    expect(svg).toContain('role="img"');
  });

  it('題名は見出しと読み上げの両方に出す', () => {
    const svg = renderChartSvg(data(), { type: 'line', title: 'セッション推移' });
    expect(svg).toContain('<title>セッション推移</title>');
    expect(svg).toContain('>セッション推移</text>');
  });

  it('題名が無ければ列の名前で読み上げる', () => {
    const svg = renderChartSvg(data(), { type: 'line' });
    expect(svg).toContain('<title>セッション</title>');
  });

  it('折れ線・棒・円で描き分ける', () => {
    expect(count(renderChartSvg(data(), { type: 'line' }), /<path /g)).toBeGreaterThan(0);
    expect(count(renderChartSvg(data(), { type: 'bar' }), /<rect /g)).toBe(3);
    expect(count(renderChartSvg(data(), { type: 'pie' }), /<path /g)).toBe(3);
  });

  it('折れ線は空欄で途切れさせる', () => {
    const svg = renderChartSvg(data({ series: [{ name: 'a', values: [1, null, 3] }] }), {
      type: 'line',
    });
    // 途切れた先は別の線として描く。
    expect(count(svg, /\bM\d/g)).toBe(2);
  });

  it('値の列が複数なら色を分けて凡例を出す', () => {
    const svg = renderChartSvg(
      data({
        series: [
          { name: 'セッション', values: [120, 140, 90] },
          { name: 'ユーザー', values: [80, 95, 60] },
        ],
      }),
      { type: 'line' },
    );
    const colors = new Set(svg.match(/stroke="#[0-9a-f]{6}" stroke-width="2"/g) ?? []);
    expect(colors.size).toBe(2);
    expect(svg).toContain('>ユーザー</text>');
  });

  it('列が 1 つなら凡例は出さない', () => {
    const svg = renderChartSvg(data(), { type: 'line' });
    expect(count(svg, />セッション<\/text>/g)).toBe(0);
  });

  it('文字は組み立てる側で逃がす', () => {
    const svg = renderChartSvg(data({ labels: ['<b>1日</b>', '2日', '3日'] }), {
      type: 'line',
      title: 'A & B',
    });
    expect(svg).toContain('A &amp; B');
    expect(svg).not.toContain('<b>');
  });

  it('文字の色は呼ぶ側が決める', () => {
    const svg = renderChartSvg(data(), { type: 'line', ink: '#e6edf3' });
    expect(svg).toContain('fill="#e6edf3"');
    expect(svg).not.toContain('currentColor');
  });

  it('画像として貼れるよう寸法を持つ', () => {
    const svg = renderChartSvg(data(), { type: 'line' });
    expect(svg).toContain('width="640"');
    expect(svg).toContain('height="320"');
  });

  it('目盛りは 0 を含めて刻む', () => {
    const svg = renderChartSvg(data(), { type: 'line' });
    expect(svg).toContain('>0</text>');
  });

  it('点が多いときは横軸の文字を間引く', () => {
    const many = Array.from({ length: 60 }, (_, index) => `${index + 1}日`);
    const svg = renderChartSvg(
      data({ labels: many, series: [{ name: 'a', values: many.map((_, i) => i) }] }),
      { type: 'line' },
    );
    expect(count(svg, /class="mdb-chart-x"/g)).toBeLessThanOrEqual(12);
  });

  it('値がすべて同じでも潰れずに描ける', () => {
    const svg = renderChartSvg(data({ series: [{ name: 'a', values: [5, 5, 5] }] }), {
      type: 'line',
    });
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('Infinity');
  });

  it('円は空欄を飛ばし、負の値は描かない', () => {
    const svg = renderChartSvg(data({ series: [{ name: 'a', values: [3, null, -2] }] }), {
      type: 'pie',
    });
    expect(count(svg, /<path /g)).toBe(1);
  });

  it('動く仕掛けは入れない', () => {
    const svg = renderChartSvg(data(), { type: 'line', title: 'x' });
    expect(svg).not.toMatch(/<script|on[a-z]+=/i);
  });
});
