import { describe, it, expect } from 'vitest';
import { PHONE_WIDTH, nextViewport, frameWidth, needsResetForPrint } from './viewport';

describe('nextViewport', () => {
  it('押すたびに入れ替わる', () => {
    expect(nextViewport('pc')).toBe('phone');
    expect(nextViewport('phone')).toBe('pc');
  });
});

describe('frameWidth', () => {
  it('PC 表示は枠いっぱい', () => {
    expect(frameWidth('pc')).toBe('100%');
  });

  it('スマートフォン表示は決まった幅で組み直す', () => {
    expect(frameWidth('phone')).toContain(`${PHONE_WIDTH}px`);
  });

  it('枠のほうが狭いときは枠に合わせる（横にはみ出して切れない）', () => {
    expect(frameWidth('phone')).toContain('100%');
  });
});

describe('needsResetForPrint', () => {
  it('狭い表示のままでは印刷しない', () => {
    expect(needsResetForPrint('phone')).toBe(true);
  });

  it('PC 表示ならそのまま印刷できる', () => {
    expect(needsResetForPrint('pc')).toBe(false);
  });
});
