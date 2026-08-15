import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@md-business/mcp-server/logs';
import { createPlan, chooseJoinKey, chooseTimeField, joinMarks, toTimelineInput } from './timelinePlan';
import type { SampleOk } from './sampleRecords';

const sample = (records: Record<string, unknown>[], skipped = 0): SampleOk => ({
  ok: true,
  format: 'jsonl',
  records,
  skipped,
});

const api = [
  { ts: '2026-08-14T10:00:01Z', request_id: 'r-1' },
  { ts: '2026-08-14T10:00:02Z', request_id: 'r-2' },
];
const db = [
  { ts: '2026-08-14T10:00:03Z', request_id: 'r-1' },
  { ts: '2026-08-14T10:00:04Z', request_id: 'r-9' },
];

describe('読む前の下ごしらえ', () => {
  it('候補の先頭を置くが、人が選ぶまでは推定のままにする', () => {
    const plan = createPlan([{ path: 'api.jsonl', sample: sample(api) }]);

    expect(plan.sources[0].timeField).toBe('ts');
    // 表示側でここを見て「推定」と出す。候補を事実として見せないため。
    expect(plan.sources[0].confirmed).toBe(false);
  });

  it('人が選んだら推定ではなくなる', () => {
    const plan = chooseTimeField(
      createPlan([{ path: 'api.jsonl', sample: sample(api) }]),
      'api.jsonl',
      'ts',
    );

    expect(plan.sources[0].confirmed).toBe(true);
  });

  it('候補が無ければ既定を置かない（勝手に選ばない）', () => {
    const plan = createPlan([{ path: 'a.jsonl', sample: sample([{ level: 'info' }]) }]);

    expect(plan.sources[0].timeField).toBe('');
    expect(plan.sources[0].candidates).toEqual([]);
    expect(plan.ready).toBe(false);
  });

  it('候補に無い項目でも人が打てば受け付ける', () => {
    const plan = chooseTimeField(
      createPlan([{ path: 'a.jsonl', sample: sample([{ level: 'info' }]) }]),
      'a.jsonl',
      'meta.when',
    );

    expect(plan.sources[0].timeField).toBe('meta.when');
    expect(plan.ready).toBe(true);
  });

  it('読めなかったファイルは理由を残し、組み立ての対象にしない', () => {
    const plan = createPlan([
      { path: 'api.jsonl', sample: sample(api) },
      { path: 'broken.txt', sample: { ok: false, error: '形式が分かりません: broken.txt' } },
    ]);

    expect(plan.sources[1].error).toContain('形式が分かりません');
    // 読めないファイルが 1 つあっても、残りは組み立てられる。
    expect(plan.ready).toBe(true);
    const input = toTimelineInput(plan);
    expect(input?.sources.map((s) => s.path)).toEqual(['api.jsonl']);
  });

  it('時刻の項目が決まっていないファイルがあれば組み立てない', () => {
    const plan = createPlan([
      { path: 'api.jsonl', sample: sample(api) },
      { path: 'b.jsonl', sample: sample([{ level: 'info' }]) },
    ]);

    expect(plan.ready).toBe(false);
    expect(toTimelineInput(plan)).toBeUndefined();
  });

  it('読める形式が 1 つも無ければ組み立てない', () => {
    const plan = createPlan([
      { path: 'broken.txt', sample: { ok: false, error: '形式が分かりません: broken.txt' } },
    ]);

    expect(plan.ready).toBe(false);
    expect(toTimelineInput(plan)).toBeUndefined();
  });

  it('拾い読みで判った形式をそのまま渡す（拡張子で読み直させない）', () => {
    const plan = createPlan([
      { path: 'app.log', sample: { ok: true, format: 'jsonl', records: api, skipped: 0 } },
    ]);

    expect(toTimelineInput(plan)?.sources[0]).toMatchObject({ path: 'app.log', format: 'jsonl' });
  });

  it('飛ばした行数を残す（読めた分だけ見ていることが分かるように）', () => {
    const plan = createPlan([{ path: 'api.jsonl', sample: sample(api, 3) }]);

    expect(plan.sources[0].skipped).toBe(3);
  });

  it('結合キーの候補は複数ファイルに跨るものだけ挙がる', () => {
    const plan = createPlan([
      { path: 'api.jsonl', sample: sample(api) },
      { path: 'db.jsonl', sample: sample(db) },
    ]);

    expect(plan.joinKeys[0].fields.map((f) => f.field)).toEqual(['request_id', 'request_id']);
    // 選ぶまではどれも選ばれていない。
    expect(plan.joinKey).toBeUndefined();
  });
});

describe('結合キーの印', () => {
  const events = (): TimelineEvent[] => [
    { source: 'api.jsonl', path: 'api.jsonl', line: 1, time: null, record: { request_id: 'r-1' } },
    { source: 'db.jsonl', path: 'db.jsonl', line: 1, time: null, record: { request_id: 'r-1' } },
    { source: 'db.jsonl', path: 'db.jsonl', line: 2, time: null, record: { request_id: 'r-9' } },
  ];

  const planWithJoin = () => {
    const plan = createPlan([
      { path: 'api.jsonl', sample: sample(api) },
      { path: 'db.jsonl', sample: sample(db) },
    ]);
    return chooseJoinKey(plan, 0);
  };

  it('2 つ以上のファイルに現れた値の行に、同じ印が付く', () => {
    const marks = joinMarks(events(), planWithJoin());

    expect(marks[0]).toBeDefined();
    expect(marks[1]).toBe(marks[0]);
  });

  it('1 つのファイルにしか無い値には印を付けない', () => {
    const marks = joinMarks(events(), planWithJoin());

    expect(marks[2]).toBeUndefined();
  });

  it('結合キーを選んでいなければ印は付かない', () => {
    const plan = createPlan([
      { path: 'api.jsonl', sample: sample(api) },
      { path: 'db.jsonl', sample: sample(db) },
    ]);

    expect(joinMarks(events(), plan)).toEqual([undefined, undefined, undefined]);
  });

  it('選び直せる（選択を外せる）', () => {
    const plan = chooseJoinKey(planWithJoin(), undefined);

    expect(plan.joinKey).toBeUndefined();
    expect(joinMarks(events(), plan)).toEqual([undefined, undefined, undefined]);
  });
});
