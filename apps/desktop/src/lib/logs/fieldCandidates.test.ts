import { describe, expect, it } from 'vitest';
import { joinKeyCandidates, timeFieldCandidates } from './fieldCandidates';

describe('時刻の項目の候補', () => {
  it('名前も値も時刻の項目が先に来る', () => {
    const records = [
      { ts: '2026-08-14T10:00:00Z', msg: 'a' },
      { ts: '2026-08-14T10:00:01Z', msg: 'b' },
    ];

    const candidates = timeFieldCandidates(records);

    expect(candidates[0].field).toBe('ts');
    expect(candidates[0].evidence).toBe('nameAndValue');
    expect(candidates[0].parsed).toBe(2);
    expect(candidates[0].sampled).toBe(2);
  });

  it('名前が時刻らしくなくても、値が時刻なら候補に出る', () => {
    const records = [{ recorded: '2026-08-14T10:00:00Z' }];

    const candidates = timeFieldCandidates(records);

    expect(candidates.map((c) => c.field)).toContain('recorded');
    expect(candidates.find((c) => c.field === 'recorded')?.evidence).toBe('valueOnly');
  });

  it('名前が時刻らしいのに読めない値は、読めないと分かる形で残る', () => {
    const records = [{ timestamp: 'きのう' }];

    const candidates = timeFieldCandidates(records);

    const found = candidates.find((c) => c.field === 'timestamp');
    expect(found?.evidence).toBe('nameOnly');
    expect(found?.parsed).toBe(0);
  });

  it('時刻に見えない項目は候補にしない', () => {
    const records = [{ level: 'info', msg: 'ok' }];

    expect(timeFieldCandidates(records)).toEqual([]);
  });

  it('数値は単位の指定が無ければ時刻にしない', () => {
    const records = [{ ts: 1_755_168_000 }];

    expect(timeFieldCandidates(records)[0].evidence).toBe('nameOnly');
    expect(timeFieldCandidates(records, { epoch: 'seconds' })[0].evidence).toBe('nameAndValue');
  });

  it('入れ子の項目は辿れる名前で返す', () => {
    const records = [{ event: { created_at: '2026-08-14T10:00:00Z' } }];

    expect(timeFieldCandidates(records)[0].field).toBe('event.created_at');
  });
});

describe('結合キーの候補', () => {
  const apiRecords = [
    { request_id: 'r-1', level: 'info' },
    { request_id: 'r-2', level: 'info' },
  ];

  it('名前がそのまま一致する項目はそのまま一致と分かる', () => {
    const candidates = joinKeyCandidates([
      { path: 'api.jsonl', records: apiRecords },
      { path: 'db.jsonl', records: [{ request_id: 'r-1', level: 'warn' }] },
    ]);

    const found = candidates.find((c) => c.fields.every((f) => f.field === 'request_id'));
    expect(found?.exact).toBe(true);
  });

  it('書き方が違うだけの項目は候補になるが、そのまま一致ではない', () => {
    const candidates = joinKeyCandidates([
      { path: 'api.jsonl', records: apiRecords },
      { path: 'db.jsonl', records: [{ requestId: 'r-1' }] },
    ]);

    const found = candidates.find((c) => c.fields.some((f) => f.field === 'requestId'));
    expect(found).toBeDefined();
    expect(found?.exact).toBe(false);
    expect(found?.fields.map((f) => f.path)).toEqual(['api.jsonl', 'db.jsonl']);
  });

  it('1 つのファイルにしか無い項目は候補にしない', () => {
    const candidates = joinKeyCandidates([
      { path: 'api.jsonl', records: [{ only_here: 'x' }] },
      { path: 'db.jsonl', records: [{ other: 'y' }] },
    ]);

    expect(candidates).toEqual([]);
  });

  it('実際に重なった値の種類を数える', () => {
    const candidates = joinKeyCandidates([
      { path: 'api.jsonl', records: apiRecords },
      { path: 'db.jsonl', records: [{ request_id: 'r-1' }, { request_id: 'r-9' }] },
    ]);

    const found = candidates.find((c) => c.fields[0].field === 'request_id');
    // r-1 だけが両方にある。r-2 / r-9 は片方だけなので数えない。
    expect(found?.sharedValues).toBe(1);
  });

  it('値が重なっていない項目は 0 として残す（名前が似ているだけと分かる）', () => {
    const candidates = joinKeyCandidates([
      { path: 'api.jsonl', records: [{ request_id: 'r-1' }] },
      { path: 'db.jsonl', records: [{ request_id: 'r-9' }] },
    ]);

    expect(candidates[0].sharedValues).toBe(0);
  });

  it('重なりの多い項目が先に来る', () => {
    const candidates = joinKeyCandidates([
      { path: 'api.jsonl', records: apiRecords },
      { path: 'db.jsonl', records: [{ request_id: 'r-1', level: 'info' }] },
    ]);

    expect(candidates[0].fields[0].field).toBe('request_id');
  });

  it('空の値は重なりに数えない', () => {
    const candidates = joinKeyCandidates([
      { path: 'api.jsonl', records: [{ request_id: '' }] },
      { path: 'db.jsonl', records: [{ request_id: '' }] },
    ]);

    expect(candidates[0].sharedValues).toBe(0);
  });
});
