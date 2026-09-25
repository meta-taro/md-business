import { describe, it, expect } from 'vitest';
import { dateInputMax } from './gridDateInput';

/**
 * 日付・日時の入力欄の上限。max を置かないと、入力欄の年が 4 桁で止まらず
 * 6 桁まで入ってしまう（年の欄が次の月の欄へ進まない）。
 */
describe('dateInputMax', () => {
  it('日付は年 4 桁の最終日', () => {
    expect(dateInputMax('date')).toBe('9999-12-31');
  });

  it('日時は datetime-local の書式（T 区切り・分まで）', () => {
    expect(dateInputMax('datetime')).toBe('9999-12-31T23:59');
  });

  it('どちらも年が 4 桁', () => {
    for (const kind of ['date', 'datetime'] as const) {
      expect(dateInputMax(kind)).toMatch(/^\d{4}-/);
    }
  });
});
