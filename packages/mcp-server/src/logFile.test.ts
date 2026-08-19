import { describe, expect, it } from 'vitest';
import { encodeLogLine, logDayName, planRetention } from './logFile';

describe('日付で分ける', () => {
  it('その日のファイル名になる', () => {
    const ts = new Date(2026, 7, 14, 9, 30).getTime();
    expect(logDayName(ts)).toBe('2026-08-14.jsonl');
  });

  it('月日は 2 桁で揃える（並べたときに日付順になる）', () => {
    expect(logDayName(new Date(2026, 0, 3).getTime())).toBe('2026-01-03.jsonl');
  });

  it('日付の境目で名前が変わる', () => {
    const before = logDayName(new Date(2026, 7, 14, 23, 59, 59).getTime());
    const after = logDayName(new Date(2026, 7, 15, 0, 0, 0).getTime());
    expect(before).toBe('2026-08-14.jsonl');
    expect(after).toBe('2026-08-15.jsonl');
  });
});

describe('1 行 1 レコードにする', () => {
  it('JSON 1 行 + 改行', () => {
    const line = encodeLogLine({ type: 'log', tool: 'read_document', ok: true, ts: 1 });
    expect(line).toBe('{"type":"log","tool":"read_document","ok":true,"ts":1}\n');
  });

  it('改行を含む理由でも 1 行に収まる', () => {
    const line = encodeLogLine({
      type: 'log',
      tool: 'read_document',
      ok: false,
      ts: 1,
      detail: '上の行\n下の行',
    });
    expect(line.split('\n')).toHaveLength(2);
    expect(JSON.parse(line).detail).toBe('上の行\n下の行');
  });
});

describe('期限を過ぎた分を仕分ける', () => {
  const names = ['2026-08-14.jsonl', '2026-07-10.jsonl', '2026-08-01.jsonl'];

  it('日数を過ぎたものだけ畳む', () => {
    const plan = planRetention(names, '2026-08-14', { retentionDays: 30, onExpire: 'archive' });
    expect(plan.archive).toEqual(['2026-07-10.jsonl']);
    expect(plan.delete).toEqual([]);
  });

  it('delete と言われたときだけ消す', () => {
    const plan = planRetention(names, '2026-08-14', { retentionDays: 30, onExpire: 'delete' });
    expect(plan.delete).toEqual(['2026-07-10.jsonl']);
    expect(plan.archive).toEqual([]);
  });

  it('keep なら何もしない', () => {
    const plan = planRetention(names, '2026-08-14', { retentionDays: 0, onExpire: 'keep' });
    expect(plan.archive).toEqual([]);
    expect(plan.delete).toEqual([]);
  });

  it('ちょうど日数のものは残す（境目は過ぎてから）', () => {
    const plan = planRetention(['2026-07-15.jsonl'], '2026-08-14', {
      retentionDays: 30,
      onExpire: 'archive',
    });
    expect(plan.archive).toEqual([]);
  });

  it('今日の分は畳まない（書いている最中）', () => {
    const plan = planRetention(['2026-08-14.jsonl'], '2026-08-14', {
      retentionDays: 0,
      onExpire: 'archive',
    });
    expect(plan.archive).toEqual([]);
  });

  it('日付として読めない名前には触らない', () => {
    const plan = planRetention(['めも.jsonl', 'archive'], '2026-08-14', {
      retentionDays: 0,
      onExpire: 'delete',
    });
    expect(plan.delete).toEqual([]);
  });
});
