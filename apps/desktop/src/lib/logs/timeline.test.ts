import { describe, expect, it } from 'vitest';
import { buildTimeline } from '@md-business/mcp-server/logs';
import { createLineSource, type LineChunk } from './lineSource';

/**
 * 行読み取りと時系列の組み立てが繋がることを確かめる。
 *
 * 時系列の中身（伏せ字・上限・時刻の読み方）は組み立て側で既に確かめてあるので、
 * ここで見るのは継ぎ目だけ——アプリ側の読み取り口をそのまま渡して組めること。
 */
function chunkedReader(files: Record<string, string>, chunkLines: number) {
  return async (relPath: string, offset: number, maxLines: number): Promise<LineChunk> => {
    const bytes = new TextEncoder().encode(files[relPath] ?? '');
    const lines: string[] = [];
    let pos = offset;
    const limit = Math.min(maxLines, chunkLines);
    while (lines.length < limit && pos < bytes.length) {
      let end = pos;
      while (end < bytes.length && bytes[end] !== 0x0a) end += 1;
      lines.push(new TextDecoder().decode(bytes.slice(pos, end)));
      pos = end < bytes.length ? end + 1 : end;
    }
    return { lines, nextOffset: pos, eof: pos >= bytes.length, truncatedLines: 0 };
  };
}

describe('アプリ側の行読み取りから時系列を組む', () => {
  it('別々のファイルの行が時刻順に混ざり、出どころが残る', async () => {
    const files = {
      'api.jsonl':
        [
          JSON.stringify({ ts: '2026-08-14T10:00:03Z', msg: 'api-後' }),
          JSON.stringify({ ts: '2026-08-14T10:00:01Z', msg: 'api-先' }),
        ].join('\n') + '\n',
      'db.jsonl': JSON.stringify({ ts: '2026-08-14T10:00:02Z', msg: 'db' }) + '\n',
    };
    // 塊をまたぐ読み方でも結果が変わらないよう、1 回 1 行しか返さない設定で読む。
    const source = createLineSource(chunkedReader(files, 1));

    const result = await buildTimeline(source, {
      sources: [
        { path: 'api.jsonl', timeField: 'ts' },
        { path: 'db.jsonl', timeField: 'ts' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.map((e) => e.record.msg)).toEqual(['api-先', 'db', 'api-後']);
    expect(result.events.map((e) => e.path)).toEqual(['api.jsonl', 'db.jsonl', 'api.jsonl']);
    // 行番号は元のファイルのまま（塊の切れ目でずれない）。
    expect(result.events[0].line).toBe(2);
  });

  it('伏せ字は組み立て側で掛かる（アプリ側で外れない）', async () => {
    const files = {
      'api.jsonl':
        JSON.stringify({ ts: '2026-08-14T10:00:00Z', authorization: 'Bearer abcdef123456' }) + '\n',
    };
    const source = createLineSource(chunkedReader(files, 10));

    const result = await buildTimeline(source, {
      sources: [{ path: 'api.jsonl', timeField: 'ts' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.events[0].record.authorization)).not.toContain('abcdef123456');
  });
});
