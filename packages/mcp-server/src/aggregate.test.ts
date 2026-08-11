import { describe, it, expect } from 'vitest';
import { aggregate } from './aggregate.js';
import { MemoryDocumentStore } from './store.js';

/**
 * 集計で確かめたいのは 3 つ。
 * 「数が合うこと」「読めない時刻を落とさずに残すこと」「多すぎるときに黙って切らないこと」。
 */

const jsonl = [
  '{"ts":"2026-08-11T05:10:00Z","level":"info","user":{"mail":"taro@example.com"}}',
  '{"ts":"2026-08-11T05:40:00Z","level":"error"}',
  '{"ts":"2026-08-11T06:00:00Z","level":"error"}',
  'これは JSON ではない',
  '{"ts":"きのう","level":"error"}',
  '{"level":"warn"}',
].join('\n');

function store(): MemoryDocumentStore {
  return new MemoryDocumentStore({ 'logs/app.jsonl': jsonl });
}

describe('aggregate', () => {
  it('条件が無ければ全件を 1 つに数える', async () => {
    const result = await aggregate(store(), { path: 'logs/app.jsonl' });
    if (!result.ok) throw new Error(result.error);
    expect(result.total).toBe(5);
    expect(result.groups).toEqual([{ key: {}, count: 5 }]);
    expect(result.skipped).toBe(1);
  });

  it('条件で絞ってから数える', async () => {
    const result = await aggregate(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'level', op: 'eq', value: 'error' }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.total).toBe(3);
  });

  it('キー別に数え、多い順に並べる', async () => {
    const result = await aggregate(store(), { path: 'logs/app.jsonl', groupBy: ['level'] });
    if (!result.ok) throw new Error(result.error);
    expect(result.groups).toEqual([
      { key: { level: 'error' }, count: 3 },
      { key: { level: 'info' }, count: 1 },
      { key: { level: 'warn' }, count: 1 },
    ]);
    expect(result.distinctGroups).toBe(3);
  });

  it('キーが無いレコードは「なし」として残す（落とさない）', async () => {
    const result = await aggregate(store(), { path: 'logs/app.jsonl', groupBy: ['user.mail'] });
    if (!result.ok) throw new Error(result.error);
    const none = result.groups.find((group) => group.key['user.mail'] === 'なし');
    expect(none?.count).toBe(4);
  });

  it('時間帯別に数える（UTC で切る・読めない時刻は落とさない）', async () => {
    const result = await aggregate(store(), {
      path: 'logs/app.jsonl',
      timeField: 'ts',
      bucket: 'hour',
      sort: 'key',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.groups).toEqual([
      { key: { ts: '2026-08-11T05' }, count: 2 },
      { key: { ts: '2026-08-11T06' }, count: 1 },
      { key: { ts: '時刻不明' }, count: 2 },
    ]);
  });

  it('時間帯とキーを組み合わせられる', async () => {
    const result = await aggregate(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'level', op: 'eq', value: 'error' }],
      timeField: 'ts',
      bucket: 'hour',
      groupBy: ['level'],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.groups).toEqual([
      { key: { ts: '2026-08-11T05', level: 'error' }, count: 1 },
      { key: { ts: '2026-08-11T06', level: 'error' }, count: 1 },
      { key: { ts: '時刻不明', level: 'error' }, count: 1 },
    ]);
  });

  it('日単位でも切れる', async () => {
    const result = await aggregate(store(), {
      path: 'logs/app.jsonl',
      timeField: 'ts',
      bucket: 'day',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.groups[0]).toEqual({ key: { ts: '2026-08-11' }, count: 3 });
  });

  it('数値の時刻は単位を指定したときだけ読む', async () => {
    const seconds = Date.UTC(2026, 7, 11, 5, 10) / 1000;
    const epoch = new MemoryDocumentStore({
      'logs/epoch.jsonl': `{"ts":${seconds}}\n{"ts":${seconds}}`,
    });
    const guessed = await aggregate(epoch, { path: 'logs/epoch.jsonl', timeField: 'ts' });
    if (!guessed.ok) throw new Error(guessed.error);
    expect(guessed.groups).toEqual([{ key: { ts: '時刻不明' }, count: 2 }]);

    const told = await aggregate(epoch, {
      path: 'logs/epoch.jsonl',
      timeField: 'ts',
      epoch: 'seconds',
    });
    if (!told.ok) throw new Error(told.error);
    expect(told.groups[0]?.key.ts).toBe('2026-08-11T05');
  });

  it('キーを名前順に並べ替えられる', async () => {
    const result = await aggregate(store(), {
      path: 'logs/app.jsonl',
      groupBy: ['level'],
      sort: 'key',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.groups.map((group) => group.key.level)).toEqual(['error', 'info', 'warn']);
  });

  it('返す数を絞ったら、絞ったと返す', async () => {
    const result = await aggregate(store(), {
      path: 'logs/app.jsonl',
      groupBy: ['level'],
      maxGroups: 1,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.groups).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.distinctGroups).toBe(3);
    // 切ったのは返す分だけで、数え上げは全件に効いている。
    expect(result.total).toBe(5);
  });

  it('キーは返す直前に伏せる（数え上げは生の値で行う）', async () => {
    const result = await aggregate(store(), { path: 'logs/app.jsonl', groupBy: ['user.mail'] });
    if (!result.ok) throw new Error(result.error);
    expect(JSON.stringify(result.groups)).not.toContain('taro@example.com');
    expect(result.masked.email).toBe(1);
  });

  it('TSV も同じように数える', async () => {
    const tsv = new MemoryDocumentStore({
      'logs/rows.tsv': ['区分\t結果', 'A\tOK', 'B\tNG', 'A\tOK'].join('\n'),
    });
    const result = await aggregate(tsv, { path: 'logs/rows.tsv', groupBy: ['区分'] });
    if (!result.ok) throw new Error(result.error);
    expect(result.groups).toEqual([
      { key: { 区分: 'A' }, count: 2 },
      { key: { 区分: 'B' }, count: 1 },
    ]);
  });

  it('ワークスペースの外は断る', async () => {
    const result = await aggregate(store(), { path: '../secret.jsonl' });
    expect(result.ok).toBe(false);
  });

  it('拡張子から形式が判らなければ断る', async () => {
    const other = new MemoryDocumentStore({ 'logs/app.log': jsonl });
    const result = await aggregate(other, { path: 'logs/app.log' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('format');
  });

  it('bucket だけ指定されても、何を切るのか判らないので断る', async () => {
    const result = await aggregate(store(), { path: 'logs/app.jsonl', bucket: 'hour' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('timeField');
  });

  it('壊れた条件は読み始める前に断る', async () => {
    const result = await aggregate(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'level', op: 'matches', value: '(' }],
    });
    expect(result.ok).toBe(false);
  });

  it('無いファイルは断る', async () => {
    const result = await aggregate(store(), { path: 'logs/none.jsonl' });
    expect(result.ok).toBe(false);
  });
});
