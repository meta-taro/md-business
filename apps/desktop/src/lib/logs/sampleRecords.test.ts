import { describe, expect, it } from 'vitest';
import type { LineSource } from '@md-business/mcp-server/logs';
import { sampleRecords } from './sampleRecords';

function source(files: Record<string, string[]>, seen?: string[]): LineSource {
  return {
    async *lines(relativePath: string): AsyncIterable<string> {
      for (const line of files[relativePath] ?? []) {
        seen?.push(line);
        yield line;
      }
    },
  };
}

const lines = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => JSON.stringify({ ts: `2026-08-14T10:00:0${i % 10}Z` }));

describe('候補を挙げるための拾い読み', () => {
  it('先頭から指定した件数だけ読む', async () => {
    const result = await sampleRecords(source({ 'a.jsonl': lines(20) }), 'a.jsonl', 3);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toHaveLength(3);
  });

  it('件数に届いたらそこで読むのをやめる', async () => {
    const seen: string[] = [];
    await sampleRecords(source({ 'a.jsonl': lines(500) }, seen), 'a.jsonl', 5);

    // 上限に届いた行までしか触らない（大きなファイルを最後まで舐めない）。
    expect(seen.length).toBeLessThan(20);
  });

  it('読めない行があっても止まらず、飛ばした数を返す', async () => {
    const result = await sampleRecords(
      source({ 'a.jsonl': ['こわれた行', JSON.stringify({ ts: 1 })] }),
      'a.jsonl',
      10,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it('形式が分からない拡張子は断る（推測しない）', async () => {
    const result = await sampleRecords(source({ 'a.txt': ['{}'] }), 'a.txt', 10);

    expect(result.ok).toBe(false);
  });

  it('形式を指定すれば拡張子に関係なく読む', async () => {
    const result = await sampleRecords(source({ 'a.log': ['{"ts":1}'] }), 'a.log', 10, 'jsonl');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toHaveLength(1);
    expect(result.format).toBe('jsonl');
  });

  it('読めなかったときは理由を返す', async () => {
    const failing: LineSource = {
      async *lines(): AsyncIterable<string> {
        throw new Error('読み取りに失敗しました');
      },
    };

    const result = await sampleRecords(failing, 'a.jsonl', 10);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('読み取りに失敗しました');
  });
});
