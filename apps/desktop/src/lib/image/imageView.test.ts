import { describe, expect, it } from 'vitest';
import { imageKindLabel, nextFitMode } from './imageView';

describe('imageKindLabel', () => {
  it('MIME から短い呼び名を作る', () => {
    expect(imageKindLabel('image/png')).toBe('PNG');
    expect(imageKindLabel('image/jpeg')).toBe('JPEG');
    expect(imageKindLabel('image/gif')).toBe('GIF');
    expect(imageKindLabel('image/webp')).toBe('WEBP');
  });

  it('SVG は接尾辞を落として呼ぶ', () => {
    // `image/svg+xml` をそのまま出すと画面では読みにくい。
    expect(imageKindLabel('image/svg+xml')).toBe('SVG');
  });

  it('知らない形は空にする', () => {
    // 当てずっぽうの呼び名を出すくらいなら、何も出さないほうがよい。
    expect(imageKindLabel('application/octet-stream')).toBe('');
    expect(imageKindLabel('')).toBe('');
  });
});

describe('nextFitMode', () => {
  it('全体に合わせると原寸を行き来する', () => {
    expect(nextFitMode('fit')).toBe('actual');
    expect(nextFitMode('actual')).toBe('fit');
  });
});
