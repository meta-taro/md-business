import { describe, expect, it } from 'vitest';
import {
  addPoint,
  emptyInk,
  eraseAt,
  parseInk,
  serializeInk,
  sheetKey,
  type InkStroke,
} from './inkModel';

const stroke = (points: number[], tool: InkStroke['tool'] = 'pen'): InkStroke => ({
  tool,
  color: '#d33',
  width: 0.004,
  points,
});

describe('sheetKey', () => {
  it('原本の番号があればそれで引く。無ければ通し番号', () => {
    expect(sheetKey('p.19', 4)).toBe('p.19');
    expect(sheetKey('', 4)).toBe('#5');
    expect(sheetKey('  ', 0)).toBe('#1');
  });
});

describe('addPoint', () => {
  it('前の点から離れていれば足す', () => {
    expect(addPoint([0.1, 0.1], 0.2, 0.1, 0.001)).toEqual([0.1, 0.1, 0.2, 0.1]);
  });

  it('ほとんど動いていない点は足さない（線の重さを抑える）', () => {
    const points = [0.1, 0.1];
    expect(addPoint(points, 0.1001, 0.1, 0.001)).toBe(points);
  });

  it('最初の点は必ず足す', () => {
    expect(addPoint([], 0.5, 0.5, 0.001)).toEqual([0.5, 0.5]);
  });
});

describe('eraseAt', () => {
  it('触れた線だけを消す', () => {
    const near = stroke([0.1, 0.1, 0.2, 0.1]);
    const far = stroke([0.8, 0.8, 0.9, 0.9]);
    expect(eraseAt([near, far], 0.15, 0.1, 0.01)).toEqual([far]);
  });

  it('点と点の間をなぞっても消える', () => {
    const line = stroke([0, 0, 1, 0]);
    expect(eraseAt([line], 0.5, 0.005, 0.01)).toEqual([]);
  });

  it('何も消えなければ同じ配列を返す（保存を起こさない）', () => {
    const strokes = [stroke([0.1, 0.1, 0.2, 0.1])];
    expect(eraseAt(strokes, 0.9, 0.9, 0.01)).toBe(strokes);
  });
});

describe('serializeInk / parseInk', () => {
  it('書いて読み戻せる。座標は丸めて軽くする', () => {
    const data = emptyInk();
    data.sheets['p.1'] = [stroke([0.123456, 0.5, 0.2, 0.25])];
    const back = parseInk(serializeInk(data));
    expect(back.sheets['p.1']![0]!.points).toEqual([0.1235, 0.5, 0.2, 0.25]);
    expect(back.sheets['p.1']![0]!.color).toBe('#d33');
  });

  it('線の無いページは書き出さない', () => {
    const data = emptyInk();
    data.sheets['p.1'] = [];
    expect(JSON.parse(serializeInk(data)).sheets).toEqual({});
  });

  it('壊れた中身・知らない形は空として扱う', () => {
    expect(parseInk('')).toEqual(emptyInk());
    expect(parseInk('{')).toEqual(emptyInk());
    expect(parseInk('{"v":2,"sheets":{}}')).toEqual(emptyInk());
    expect(parseInk('[]')).toEqual(emptyInk());
  });

  it('おかしな線だけを捨て、ほかは残す', () => {
    const text = JSON.stringify({
      v: 1,
      sheets: {
        'p.1': [
          { tool: 'pen', color: '#000', width: 0.004, points: [0.1, 0.1, 0.2, 0.2] },
          { tool: 'laser', color: '#000', width: 0.004, points: [0.1, 0.1] },
          { tool: 'pen', color: 'url(javascript:x)', width: 0.004, points: [0.1, 0.1] },
          { tool: 'pen', color: '#000', width: 0.004, points: [0.1, 'x'] },
          { tool: 'pen', color: '#000', width: 0.004, points: [0.1] },
        ],
        'p.2': 'x',
      },
    });
    const back = parseInk(text);
    expect(back.sheets['p.1']).toHaveLength(1);
    expect(back.sheets['p.2']).toBeUndefined();
  });
});
