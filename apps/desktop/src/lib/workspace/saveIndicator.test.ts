import { describe, it, expect } from 'vitest';
import { formatClock, describeSaveState } from './saveIndicator';

describe('formatClock', () => {
  it('時分を 2 桁ゼロ詰めで返す', () => {
    expect(formatClock(new Date(2026, 6, 27, 9, 5))).toBe('09:05');
    expect(formatClock(new Date(2026, 6, 27, 23, 59))).toBe('23:59');
    expect(formatClock(new Date(2026, 6, 27, 0, 0))).toBe('00:00');
  });
});

describe('describeSaveState', () => {
  const base = { hasFile: true, dirty: false, saving: false, savedAt: null as Date | null };

  it('ファイル未オープンなら何も出さない', () => {
    expect(describeSaveState({ ...base, hasFile: false, dirty: true })).toEqual({ kind: 'none' });
  });

  it('保存中は保存中を出す（未保存の変更があっても保存中が優先）', () => {
    expect(describeSaveState({ ...base, saving: true, dirty: true })).toEqual({ kind: 'saving' });
  });

  it('未保存の変更があれば未保存を出す', () => {
    expect(describeSaveState({ ...base, dirty: true })).toEqual({ kind: 'dirty' });
  });

  it('保存済みなら最後に保存した時刻を出す', () => {
    const at = new Date(2026, 6, 27, 15, 46);
    expect(describeSaveState({ ...base, savedAt: at })).toEqual({ kind: 'saved', time: '15:46' });
  });

  it('まだ一度も保存していなければ何も出さない', () => {
    expect(describeSaveState(base)).toEqual({ kind: 'none' });
  });

  it('未保存の変更は、前回の保存時刻より優先する', () => {
    const at = new Date(2026, 6, 27, 15, 46);
    expect(describeSaveState({ ...base, dirty: true, savedAt: at })).toEqual({ kind: 'dirty' });
  });
});
