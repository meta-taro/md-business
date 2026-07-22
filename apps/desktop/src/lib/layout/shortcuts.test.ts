import { describe, it, expect } from 'vitest';
import { matchShortcut, type ShortcutEvent } from './shortcuts';

/** KeyboardEvent 互換の最小オブジェクトを組む（修飾キーは既定 false）。 */
function ev(partial: Partial<ShortcutEvent>): ShortcutEvent {
  return {
    key: 's',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  };
}

describe('matchShortcut — 修飾キー + 文字からアクションを解決', () => {
  it('Ctrl+S / Cmd+S は save', () => {
    expect(matchShortcut(ev({ ctrlKey: true, key: 's' }))).toBe('save');
    expect(matchShortcut(ev({ metaKey: true, key: 's' }))).toBe('save');
  });

  it('Ctrl+P / Cmd+P は pdf', () => {
    expect(matchShortcut(ev({ ctrlKey: true, key: 'p' }))).toBe('pdf');
    expect(matchShortcut(ev({ metaKey: true, key: 'p' }))).toBe('pdf');
  });

  it('大文字 S / P（Shift 無しの CapsLock 等）でも解決する', () => {
    expect(matchShortcut(ev({ ctrlKey: true, key: 'S' }))).toBe('save');
    expect(matchShortcut(ev({ ctrlKey: true, key: 'P' }))).toBe('pdf');
  });

  it('primary 修飾（Ctrl / Cmd）が無ければ null', () => {
    expect(matchShortcut(ev({ key: 's' }))).toBeNull();
    expect(matchShortcut(ev({ key: 'p' }))).toBeNull();
  });

  it('Alt / Shift 併用は別ショートカットとみなし null（誤爆防止）', () => {
    expect(matchShortcut(ev({ ctrlKey: true, altKey: true, key: 's' }))).toBeNull();
    expect(matchShortcut(ev({ ctrlKey: true, shiftKey: true, key: 's' }))).toBeNull();
    expect(matchShortcut(ev({ metaKey: true, altKey: true, key: 'p' }))).toBeNull();
  });

  it('割り当ての無いキーは null', () => {
    expect(matchShortcut(ev({ ctrlKey: true, key: 'a' }))).toBeNull();
    expect(matchShortcut(ev({ ctrlKey: true, key: 'k' }))).toBeNull();
  });
});
