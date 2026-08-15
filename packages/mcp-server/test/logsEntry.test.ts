import { describe, expect, it } from 'vitest';
import { buildTimeline, type LineSource } from '../src/logs.js';

/**
 * 行だけ返せるものを渡して時系列を組めることを固定する。
 *
 * 時系列に要るのは「1 行ずつ読めること」だけで、書き込みや一覧は要らない。
 * ここが読み書き一式（DocumentStore）を要求したままだと、
 * デスクトップ側は使わない口まで用意しないと呼べない
 * ——用意すれば、呼ばれない書き込み口が偽物として残る。
 */
function linesOnly(files: Record<string, string[]>): LineSource {
  return {
    async *lines(relativePath: string): AsyncIterable<string> {
      const body = files[relativePath];
      if (body === undefined) throw new Error(`ファイルがありません: ${relativePath}`);
      for (const line of body) yield line;
    },
  };
}

describe('logs エントリ', () => {
  it('行だけ返せるものから時系列を組める', async () => {
    const source = linesOnly({
      'a.jsonl': [
        JSON.stringify({ time: '2026-08-14T10:00:02Z', msg: 'あと' }),
        JSON.stringify({ time: '2026-08-14T10:00:00Z', msg: 'さき' }),
      ],
    });

    const result = await buildTimeline(source, {
      sources: [{ path: 'a.jsonl', timeField: 'time' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.map((e) => e.record.msg)).toEqual(['さき', 'あと']);
    // 出どころは混ぜた後も残る。
    expect(result.events[0].path).toBe('a.jsonl');
    expect(result.events[0].line).toBe(2);
  });
});
