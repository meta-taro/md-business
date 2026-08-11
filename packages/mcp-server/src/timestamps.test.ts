import { describe, it, expect } from 'vitest';
import { parseTimestamp, bucketLabel } from './timestamps.js';

/**
 * 時刻は調査の背骨なので、**読めた形式だけを読む**。
 * 読めないものを勘で読むと、時系列が静かに狂ったまま結論まで通ってしまう。
 * ここで確かめるのは「読める形は読める」と、その裏返しの「読めない形は読めないと返る」。
 */

describe('parseTimestamp', () => {
  it('Z 付きの ISO 8601 を読む', () => {
    expect(parseTimestamp('2026-08-11T05:00:00Z')?.ms).toBe(Date.UTC(2026, 7, 11, 5, 0, 0));
  });

  it('小数秒を読む', () => {
    expect(parseTimestamp('2026-08-11T05:00:00.123Z')?.ms).toBe(
      Date.UTC(2026, 7, 11, 5, 0, 0, 123),
    );
  });

  it('時差付きを読む（時差の分だけ戻す）', () => {
    expect(parseTimestamp('2026-08-11T14:00:00+09:00')?.ms).toBe(Date.UTC(2026, 7, 11, 5, 0, 0));
    expect(parseTimestamp('2026-08-11T14:00:00+0900')?.ms).toBe(Date.UTC(2026, 7, 11, 5, 0, 0));
  });

  it('T の代わりに空白でも読む（ログでよくある形）', () => {
    expect(parseTimestamp('2026-08-11 05:00:00')?.ms).toBe(Date.UTC(2026, 7, 11, 5, 0, 0));
  });

  it('時差の無い表記は UTC として扱う（機械のタイムゾーンで解釈しない）', () => {
    // 実行機のタイムゾーンで結果が変わらないことが要点。ローカル解釈だと開発機と CI でずれる。
    expect(parseTimestamp('2026-08-11T05:00:00')?.ms).toBe(Date.UTC(2026, 7, 11, 5, 0, 0));
  });

  it('日付だけなら 00:00 とみなす', () => {
    expect(parseTimestamp('2026-08-11')?.ms).toBe(Date.UTC(2026, 7, 11));
  });

  it('前後の空白は無視する', () => {
    expect(parseTimestamp('  2026-08-11T05:00:00Z  ')?.ms).toBe(Date.UTC(2026, 7, 11, 5, 0, 0));
  });

  it('存在しない日付は読めないと返す', () => {
    expect(parseTimestamp('2026-13-01T00:00:00Z')).toBeUndefined();
    expect(parseTimestamp('2026-02-30T00:00:00Z')).toBeUndefined();
    expect(parseTimestamp('2026-08-11T25:00:00Z')).toBeUndefined();
  });

  it('読めない形は読めないと返す（勘で読まない）', () => {
    expect(parseTimestamp('Aug 11 05:00:00')).toBeUndefined();
    expect(parseTimestamp('11/08/2026')).toBeUndefined();
    expect(parseTimestamp('きのう')).toBeUndefined();
    expect(parseTimestamp('')).toBeUndefined();
  });

  it('数値は単位の指定が無ければ読まない（桁数で秒かミリ秒かを当てない）', () => {
    expect(parseTimestamp(1786510800)).toBeUndefined();
    expect(parseTimestamp('1786510800')).toBeUndefined();
  });

  it('単位を指定されたときだけ数値を読む', () => {
    expect(parseTimestamp(1786510800, { epoch: 'seconds' })?.ms).toBe(1786510800000);
    expect(parseTimestamp('1786510800000', { epoch: 'milliseconds' })?.ms).toBe(1786510800000);
  });

  it('単位を指定しても日時の文字列はそのまま読む', () => {
    expect(parseTimestamp('2026-08-11T05:00:00Z', { epoch: 'seconds' })?.ms).toBe(
      Date.UTC(2026, 7, 11, 5, 0, 0),
    );
  });

  it('文字列でも数値でもないものは読めないと返す', () => {
    expect(parseTimestamp(null)).toBeUndefined();
    expect(parseTimestamp(undefined)).toBeUndefined();
    expect(parseTimestamp({ ts: 1 })).toBeUndefined();
  });

  it('読めたときは正規化した表記も返す（表示を揃えるため）', () => {
    expect(parseTimestamp('2026-08-11 05:00:00')?.text).toBe('2026-08-11T05:00:00.000Z');
  });
});

describe('bucketLabel', () => {
  const ms = Date.UTC(2026, 7, 11, 5, 7, 9, 500);

  it('単位ごとに UTC で切る', () => {
    expect(bucketLabel(ms, 'day')).toBe('2026-08-11');
    expect(bucketLabel(ms, 'hour')).toBe('2026-08-11T05');
    expect(bucketLabel(ms, 'minute')).toBe('2026-08-11T05:07');
    expect(bucketLabel(ms, 'second')).toBe('2026-08-11T05:07:09');
  });

  it('ラベルは辞書順が時刻順と一致する（並べ替えに使うため）', () => {
    const later = bucketLabel(Date.UTC(2026, 7, 11, 12), 'hour');
    expect(bucketLabel(ms, 'hour') < later).toBe(true);
  });
});
