import { describe, expect, it } from 'vitest';
import {
  extractStampChars,
  inferStampShape,
  renderStampSvg,
} from '../src/stamp.js';

describe('inferStampShape', () => {
  it('returns square for 株式会社 prefix', () => {
    expect(inferStampShape('株式会社Dokokade')).toBe('square');
  });

  it('returns square for 合同会社', () => {
    expect(inferStampShape('合同会社キングダム')).toBe('square');
  });

  it('returns square for (株) abbreviation', () => {
    expect(inferStampShape('(株)サンプル')).toBe('square');
    expect(inferStampShape('（株）サンプル')).toBe('square');
  });

  it('returns square for ㈱ glyph', () => {
    expect(inferStampShape('㈱サンプル')).toBe('square');
  });

  it('returns round for an individual name', () => {
    expect(inferStampShape('田中甫朋')).toBe('round');
    expect(inferStampShape('高橋')).toBe('round');
  });
});

describe('extractStampChars', () => {
  it('strips 株式会社 prefix and keeps body', () => {
    expect(extractStampChars('株式会社Dokokade')).toEqual(['D', 'o', 'k', 'o']);
  });

  it('strips 株式会社 prefix from CJK company name', () => {
    expect(extractStampChars('株式会社キングダム')).toEqual(['キ', 'ン', 'グ', 'ダ']);
  });

  it('passes a personal name through, capped at 4 chars', () => {
    expect(extractStampChars('田中甫朋')).toEqual(['田', '中', '甫', '朋']);
    expect(extractStampChars('高橋')).toEqual(['高', '橋']);
    expect(extractStampChars('田中')).toEqual(['田', '中']);
  });

  it('respects a custom cap', () => {
    expect(extractStampChars('株式会社キングダム', 2)).toEqual(['キ', 'ン']);
  });
});

describe('renderStampSvg', () => {
  it('returns null when shape is off', () => {
    expect(renderStampSvg({ text: '田中', shape: 'off' })).toBeNull();
  });

  it('returns null when text is effectively empty after cleanup', () => {
    expect(renderStampSvg({ text: '株式会社' })).toBeNull();
  });

  it('auto-detects corporate -> square frame', () => {
    const out = renderStampSvg({ text: '株式会社キングダム' });
    expect(out).not.toBeNull();
    expect(out!.shape).toBe('square');
    expect(out!.svg).toContain('<rect');
    expect(out!.svg).not.toContain('<circle');
    expect(out!.svg).toContain('キ');
    expect(out!.svg).toContain('ダ');
  });

  it('auto-detects personal -> round frame', () => {
    const out = renderStampSvg({ text: '田中甫朋' });
    expect(out).not.toBeNull();
    expect(out!.shape).toBe('round');
    expect(out!.svg).toContain('<circle');
    expect(out!.svg).not.toContain('<rect');
  });

  it('honors explicit shape override', () => {
    const out = renderStampSvg({ text: '田中', shape: 'square' });
    expect(out!.shape).toBe('square');
  });

  it('renders a single-row Latin layout when text is ASCII', () => {
    const out = renderStampSvg({ text: '株式会社Dokokade' });
    expect(out).not.toBeNull();
    // Latin path emits exactly one <text> element with the uppercased string.
    const matches = out!.svg.match(/<text /g);
    expect(matches?.length).toBe(1);
    expect(out!.svg).toContain('DOKO');
  });

  it('respects a custom font family swap-point', () => {
    const out = renderStampSvg({ text: '田中', font: '"My Tensho", serif' });
    expect(out!.svg).toContain('My Tensho');
  });

  it('uses red fill / stroke (#c8161d)', () => {
    const out = renderStampSvg({ text: '田中' });
    expect(out!.svg).toContain('#c8161d');
  });

  it('lays out 3 CJK chars in a single column', () => {
    const out = renderStampSvg({ text: '佐藤翔' });
    const matches = out!.svg.match(/<text /g);
    expect(matches?.length).toBe(3);
  });

  it('lays out 1 CJK char centered', () => {
    const out = renderStampSvg({ text: '寺' });
    const matches = out!.svg.match(/<text /g);
    expect(matches?.length).toBe(1);
  });

  it('escapes special characters in the rendered text', () => {
    const out = renderStampSvg({ text: '<&>' });
    expect(out!.svg).toContain('&lt;');
    expect(out!.svg).toContain('&amp;');
    expect(out!.svg).toContain('&gt;');
  });
});

