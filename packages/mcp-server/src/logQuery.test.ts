import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregate } from './aggregate.js';
import { FileDocumentStore } from './fileStore.js';
import { logDayName } from './logFile.js';
import { createLogSink, nodeLogFs } from './logSink.js';
import { searchLines } from './logTools.js';
import { filterRecords } from './records.js';
import { buildTimeline } from './timeline.js';
import type { ToolLogEntry } from './toolLog.js';

/**
 * 残した作業ログを、既にあるツールでそのまま探せるかを実物で確かめる。
 *
 * 書く側（logSink）と探す側（filter_records / aggregate / build_timeline / search_lines）は
 * 別々にテストしてあるが、繋がっている保証はそこに無い。1 行 1 レコードの形・置き場・
 * `ts` が数値であること、のどれが崩れても探せなくなるので、実際のファイルを書いて読む。
 */

const DAY = Date.UTC(2026, 7, 14, 3, 0, 0);
const HOUR = 3_600_000;

function entry(offset: number, over: Partial<ToolLogEntry>): ToolLogEntry {
  return { type: 'log', tool: 'read_document', ok: true, ts: DAY + offset, ...over };
}

const ENTRIES: ToolLogEntry[] = [
  entry(0, { path: 'docs/請求書.md' }),
  entry(60_000, { tool: 'update_document', path: 'docs/請求書.md' }),
  entry(2 * HOUR, { tool: 'update_tsv_row', ok: false, path: 'docs/test-specs/001-a.tsv', detail: '行が見つかりません' }),
  entry(3 * HOUR, { tool: 'list_schemas' }),
];

let root: string;
let store: FileDocumentStore;
let path: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mdb-logquery-'));
  store = new FileDocumentStore(root);
  const write = createLogSink({ getRoot: () => root, fs: nodeLogFs() });
  for (const item of ENTRIES) write(item);
  path = `.md-business/logs/${logDayName(DAY)}`;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('残した作業ログを探す', () => {
  it('置き場が既定のツールから読める場所になっている', async () => {
    const result = await filterRecords(store, { path });
    if (!result.ok) throw new Error(result.error);
    expect(result.format).toBe('jsonl');
    expect(result.records).toHaveLength(ENTRIES.length);
  });

  it('失敗した操作だけを絞れる', async () => {
    const result = await filterRecords(store, {
      path,
      // 真偽値も文字列で指定する（条件の値は形式を問わず文字列で受ける）。
      where: [{ field: 'ok', op: 'eq', value: 'false' }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.record).toMatchObject({ tool: 'update_tsv_row' });
  });

  it('1 つのファイルに何をしたかを絞れる', async () => {
    const result = await filterRecords(store, {
      path,
      where: [{ field: 'path', op: 'eq', value: 'docs/請求書.md' }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.records.map((item) => item.record.tool)).toEqual(['read_document', 'update_document']);
  });

  it('いつ・何が・何件かを数えられる', async () => {
    const result = await aggregate(store, { path, groupBy: ['tool'] });
    if (!result.ok) throw new Error(result.error);
    expect(result.total).toBe(ENTRIES.length);
    expect(result.groups).toEqual([
      { key: { tool: 'list_schemas' }, count: 1 },
      { key: { tool: 'read_document' }, count: 1 },
      { key: { tool: 'update_document' }, count: 1 },
      { key: { tool: 'update_tsv_row' }, count: 1 },
    ]);
  });

  it('時刻は数値のままでも時間帯に落とせる', async () => {
    const result = await aggregate(store, {
      path,
      timeField: 'ts',
      bucket: 'hour',
      epoch: 'milliseconds',
      sort: 'key',
    });
    if (!result.ok) throw new Error(result.error);
    // 読めない時刻として 1 つにまとまってしまうと、時間帯で追えなくなる。
    expect(result.groups).toHaveLength(3);
    expect(Object.values(result.groups[0]?.key ?? {})[0]).not.toBe('時刻不明');
  });

  it('時刻順に並べられる', async () => {
    const result = await buildTimeline(store, {
      sources: [{ path, timeField: 'ts', label: '作業ログ' }],
      epoch: 'milliseconds',
      fields: ['tool'],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.events.map((event) => event.record.tool)).toEqual([
      'read_document',
      'update_document',
      'update_tsv_row',
      'list_schemas',
    ]);
    expect(result.events[0]?.source).toBe('作業ログ');
  });

  it('理由の文字列から当たりを付けられる', async () => {
    const result = await searchLines(store, { path, pattern: '行が見つかりません' });
    if (!result.ok) throw new Error(result.error);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.text).toContain('update_tsv_row');
  });
});
