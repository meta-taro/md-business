import { describe, it, expect } from 'vitest';

import { parseWindowShot } from './windowShot.js';

describe('parseWindowShot', () => {
  it('撮れたものを読み取る', () => {
    expect(
      parseWindowShot({
        data: 'iVBORw0KGgo=',
        width: 1400,
        height: 875,
        windowWidth: 1920,
        windowHeight: 1200,
      }),
    ).toEqual({
      data: 'iVBORw0KGgo=',
      width: 1400,
      height: 875,
      windowWidth: 1920,
      windowHeight: 1200,
    });
  });

  it('中身の無い答えは読み取らない', () => {
    // 空の画像を「撮れた」として返すと、受け取った側は真っ白な画面を見たことになる。
    expect(parseWindowShot(null)).toBeNull();
    expect(parseWindowShot({ width: 10, height: 10, windowWidth: 10, windowHeight: 10 })).toBeNull();
    expect(
      parseWindowShot({ data: '', width: 10, height: 10, windowWidth: 10, windowHeight: 10 }),
    ).toBeNull();
  });

  it('大きさが数として揃っていない答えは読み取らない', () => {
    expect(
      parseWindowShot({ data: 'x', width: '10', height: 10, windowWidth: 10, windowHeight: 10 }),
    ).toBeNull();
    expect(parseWindowShot({ data: 'x', width: 10, height: 10 })).toBeNull();
  });
});
