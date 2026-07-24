import { describe, it, expect } from 'vitest';
import { parseAutosaveEnabled, shouldAutosave, AUTOSAVE_DELAY_MS } from './autosave';

describe('parseAutosaveEnabled', () => {
  it('未保存（null）は既定オン', () => {
    expect(parseAutosaveEnabled(null)).toBe(true);
  });

  it("'false' のみ無効", () => {
    expect(parseAutosaveEnabled('false')).toBe(false);
  });

  it("'true' はオン", () => {
    expect(parseAutosaveEnabled('true')).toBe(true);
  });

  it('未知の値はオン（既定へフォールバック）', () => {
    expect(parseAutosaveEnabled('yes')).toBe(true);
    expect(parseAutosaveEnabled('')).toBe(true);
  });
});

describe('shouldAutosave', () => {
  const base = { enabled: true, hasFile: true, dirty: true, saving: false };

  it('有効・ファイルあり・未保存差分あり・保存中でない → 保存する', () => {
    expect(shouldAutosave(base)).toBe(true);
  });

  it('無効なら保存しない', () => {
    expect(shouldAutosave({ ...base, enabled: false })).toBe(false);
  });

  it('ファイル未オープンなら保存しない', () => {
    expect(shouldAutosave({ ...base, hasFile: false })).toBe(false);
  });

  it('未保存差分が無ければ保存しない', () => {
    expect(shouldAutosave({ ...base, dirty: false })).toBe(false);
  });

  it('保存中なら保存しない（二重保存防止）', () => {
    expect(shouldAutosave({ ...base, saving: true })).toBe(false);
  });
});

describe('AUTOSAVE_DELAY_MS', () => {
  it('正の有限値', () => {
    expect(AUTOSAVE_DELAY_MS).toBeGreaterThan(0);
    expect(Number.isFinite(AUTOSAVE_DELAY_MS)).toBe(true);
  });
});
