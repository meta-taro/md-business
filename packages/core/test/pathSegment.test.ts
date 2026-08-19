import { describe, expect, it } from 'vitest';
import { unusableSegmentReason } from '../src/pathSegment.js';

describe('unusableSegmentReason', () => {
  it('ふつうの名前は受け取れる', () => {
    expect(unusableSegmentReason('docs')).toBeNull();
    expect(unusableSegmentReason('検証 一覧.tsv')).toBeNull();
    expect(unusableSegmentReason('console.md')).toBeNull();
    expect(unusableSegmentReason('common.ts')).toBeNull();
  });

  it('コロンを含む名前は代替データストリームになるので受け取れない', () => {
    expect(unusableSegmentReason('a.md:evil')).toBe('stream-separator');
    expect(unusableSegmentReason(':hidden')).toBe('stream-separator');
  });

  it('予約デバイス名は拡張子を付けても受け取れない', () => {
    for (const name of ['con', 'CON', 'con.md', 'PRN', 'aux.tsv', 'nul', 'com1', 'LPT9']) {
      expect(unusableSegmentReason(name), name).toBe('reserved-device-name');
    }
  });
});
