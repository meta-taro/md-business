import { describe, expect, it } from 'vitest';
import { createLineSource, type LineChunk } from './lineSource';

/** 与えた本文を、Rust 側と同じ約束で塊にして返す偽の読み取り口。 */
function fakeReader(files: Record<string, string>, chunkLines = 2) {
  const calls: { relPath: string; offset: number }[] = [];
  const reader = async (relPath: string, offset: number, maxLines: number): Promise<LineChunk> => {
    calls.push({ relPath, offset });
    const body = files[relPath];
    if (body === undefined) throw new Error(`ファイル解決失敗: ${relPath}`);
    const bytes = new TextEncoder().encode(body);
    const lines: string[] = [];
    let pos = offset;
    const limit = Math.min(maxLines, chunkLines);
    while (lines.length < limit && pos < bytes.length) {
      let end = pos;
      while (end < bytes.length && bytes[end] !== 0x0a) end += 1;
      const hasNewline = end < bytes.length;
      lines.push(new TextDecoder().decode(bytes.slice(pos, end)));
      pos = hasNewline ? end + 1 : end;
    }
    return { lines, nextOffset: pos, eof: pos >= bytes.length, truncatedLines: 0 };
  };
  return { reader, calls };
}

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const line of iterable) out.push(line);
  return out;
}

describe('createLineSource', () => {
  it('塊をまたいで全部の行を返す', async () => {
    const { reader } = fakeReader({ 'a.jsonl': '1\n2\n3\n4\n5\n' });
    const source = createLineSource(reader);
    expect(await collect(source.lines('a.jsonl'))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('返ってきた位置で読み直す（同じ場所を二度読まない）', async () => {
    const { reader, calls } = fakeReader({ 'a.jsonl': '1\n2\n3\n4\n5\n' });
    const source = createLineSource(reader);
    await collect(source.lines('a.jsonl'));
    // 0 → 4 → 8 と進み、同じ offset で二度呼ばない。
    expect(calls.map((c) => c.offset)).toEqual([0, 4, 8]);
  });

  it('末尾の改行で空行を増やさない', async () => {
    // 行番号を実ファイルと合わせるため、末尾改行は行を 1 本足さない。
    const { reader } = fakeReader({ 'a.jsonl': '1\n2\n' });
    const source = createLineSource(reader);
    expect(await collect(source.lines('a.jsonl'))).toEqual(['1', '2']);
  });

  it('末尾に改行が無くても最後の行を落とさない', async () => {
    const { reader } = fakeReader({ 'a.jsonl': '1\n2' });
    const source = createLineSource(reader);
    expect(await collect(source.lines('a.jsonl'))).toEqual(['1', '2']);
  });

  it('空のファイルは 1 行も返さない', async () => {
    const { reader } = fakeReader({ 'a.jsonl': '' });
    const source = createLineSource(reader);
    expect(await collect(source.lines('a.jsonl'))).toEqual([]);
  });

  it('途中でやめたらそこで読むのを止める', async () => {
    // 数百 MB のログで、先頭だけ見て抜けたときに端まで読み続けないこと。
    const { reader, calls } = fakeReader({ 'a.jsonl': '1\n2\n3\n4\n5\n6\n7\n8\n' });
    const source = createLineSource(reader);
    for await (const line of source.lines('a.jsonl')) {
      if (line === '1') break;
    }
    expect(calls.length).toBe(1);
  });

  it('切られた行があったことを数えて持つ', async () => {
    // 切ったことを返さないと、短くなった行が実体のように見える。
    const reader = async (): Promise<LineChunk> => ({
      lines: ['xxx'],
      nextOffset: 10,
      eof: true,
      truncatedLines: 1,
    });
    const source = createLineSource(reader);
    await collect(source.lines('a.log'));
    expect(source.truncatedLines).toBe(1);
  });

  it('進まない返答で無限に回らない', async () => {
    // offset が進まないのに eof も立たない返答は、実装の壊れ方としてありうる。
    // そのまま信じると画面が固まるので、読むのをやめる。
    const reader = async (): Promise<LineChunk> => ({
      lines: ['x'],
      nextOffset: 0,
      eof: false,
      truncatedLines: 0,
    });
    const source = createLineSource(reader);
    await expect(collect(source.lines('a.log'))).rejects.toThrow(/進み/);
  });
});
