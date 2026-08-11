import { describe, it, expect } from 'vitest';
import { buildTimeline } from './timeline.js';
import { MemoryDocumentStore } from './store.js';

/**
 * 時系列で確かめたいのは 3 つ。
 * 「別のファイルの行が時刻順に混ざること」「読めない時刻の行が消えないこと」
 * 「どのファイルの何行目から来たかが残ること」。
 */

const app = [
  '{"ts":"2026-08-11T05:10:00Z","msg":"start"}',
  '{"ts":"2026-08-11T05:30:00Z","msg":"finish"}',
  '{"ts":"きのう","msg":"broken"}',
].join('\n');

const access = [
  '{"time":"2026-08-11T05:20:00Z","path":"/health"}',
  '{"time":"2026-08-11T05:00:00Z","path":"/login","mail":"taro@example.com"}',
].join('\n');

function store(): MemoryDocumentStore {
  return new MemoryDocumentStore({ 'logs/app.jsonl': app, 'logs/access.jsonl': access });
}

describe('buildTimeline', () => {
  it('別のファイルの行を時刻順に混ぜる', async () => {
    const result = await buildTimeline(store(), {
      sources: [
        { path: 'logs/app.jsonl', timeField: 'ts' },
        { path: 'logs/access.jsonl', timeField: 'time' },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.events.map((event) => event.time)).toEqual([
      '2026-08-11T05:00:00.000Z',
      '2026-08-11T05:10:00.000Z',
      '2026-08-11T05:20:00.000Z',
      '2026-08-11T05:30:00.000Z',
      null,
    ]);
  });

  it('どのファイルの何行目かを残す', async () => {
    const result = await buildTimeline(store(), {
      sources: [
        { path: 'logs/app.jsonl', timeField: 'ts' },
        { path: 'logs/access.jsonl', timeField: 'time', label: 'access' },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.events[0]).toMatchObject({
      source: 'access',
      path: 'logs/access.jsonl',
      line: 2,
    });
    expect(result.events[1]).toMatchObject({ source: 'logs/app.jsonl', line: 1 });
  });

  it('読めない時刻の行は末尾に残す（落とさない）', async () => {
    const result = await buildTimeline(store(), {
      sources: [{ path: 'logs/app.jsonl', timeField: 'ts' }],
    });
    if (!result.ok) throw new Error(result.error);
    const last = result.events.at(-1);
    expect(last?.time).toBeNull();
    expect(last?.record).toMatchObject({ msg: 'broken' });
    expect(result.unknownTime).toBe(1);
  });

  it('時刻の窓で絞れる（窓の外は落ちるが、読めない時刻は残る）', async () => {
    const result = await buildTimeline(store(), {
      sources: [{ path: 'logs/app.jsonl', timeField: 'ts' }],
      from: '2026-08-11T05:20:00Z',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.events.map((event) => event.time)).toEqual([
      '2026-08-11T05:30:00.000Z',
      null,
    ]);
  });

  it('条件でも絞れる', async () => {
    const result = await buildTimeline(store(), {
      sources: [
        { path: 'logs/app.jsonl', timeField: 'ts' },
        { path: 'logs/access.jsonl', timeField: 'time' },
      ],
      where: [{ field: 'msg', op: 'exists' }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.events).toHaveLength(3);
  });

  it('返す項目を選べる', async () => {
    const result = await buildTimeline(store(), {
      sources: [{ path: 'logs/app.jsonl', timeField: 'ts' }],
      fields: ['msg'],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.events[0]?.record).toEqual({ msg: 'start' });
  });

  it('返す直前に伏せる', async () => {
    const result = await buildTimeline(store(), {
      sources: [{ path: 'logs/access.jsonl', timeField: 'time' }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(JSON.stringify(result.events)).not.toContain('taro@example.com');
    expect(result.masked.email).toBe(1);
  });

  it('数値の時刻は単位を指定したときだけ読む', async () => {
    const seconds = Date.UTC(2026, 7, 11, 5, 10) / 1000;
    const epoch = new MemoryDocumentStore({ 'logs/epoch.jsonl': `{"ts":${seconds}}` });

    const guessed = await buildTimeline(epoch, {
      sources: [{ path: 'logs/epoch.jsonl', timeField: 'ts' }],
    });
    if (!guessed.ok) throw new Error(guessed.error);
    expect(guessed.events[0]?.time).toBeNull();

    const told = await buildTimeline(epoch, {
      sources: [{ path: 'logs/epoch.jsonl', timeField: 'ts' }],
      epoch: 'seconds',
    });
    if (!told.ok) throw new Error(told.error);
    expect(told.events[0]?.time).toBe('2026-08-11T05:10:00.000Z');
  });

  it('上限で切ったら、どのファイルで切ったかまで返す', async () => {
    const result = await buildTimeline(store(), {
      sources: [{ path: 'logs/app.jsonl', timeField: 'ts' }],
      maxEvents: 1,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.events).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.sources[0]?.truncated).toBe(true);
  });

  it('読めなかった行は数えて返す', async () => {
    const broken = new MemoryDocumentStore({
      'logs/broken.jsonl': ['{"ts":"2026-08-11T05:00:00Z"}', 'これは JSON ではない'].join('\n'),
    });
    const result = await buildTimeline(broken, {
      sources: [{ path: 'logs/broken.jsonl', timeField: 'ts' }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.sources[0]?.skipped).toBe(1);
  });

  it('ファイルを 1 つも指定しなければ断る', async () => {
    const result = await buildTimeline(store(), { sources: [] });
    expect(result.ok).toBe(false);
  });

  it('ワークスペースの外は断る', async () => {
    const result = await buildTimeline(store(), {
      sources: [{ path: '../secret.jsonl', timeField: 'ts' }],
    });
    expect(result.ok).toBe(false);
  });

  it('読めない窓の指定は、読み始める前に断る', async () => {
    const result = await buildTimeline(store(), {
      sources: [{ path: 'logs/app.jsonl', timeField: 'ts' }],
      from: 'きのう',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('from');
  });

  it('無いファイルは断る', async () => {
    const result = await buildTimeline(store(), {
      sources: [{ path: 'logs/none.jsonl', timeField: 'ts' }],
    });
    expect(result.ok).toBe(false);
  });
});
