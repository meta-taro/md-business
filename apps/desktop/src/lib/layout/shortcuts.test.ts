import { describe, it, expect } from 'vitest';
import {
  matchShortcut,
  resolvePreviewMessage,
  PREVIEW_MESSAGE_SOURCE,
  type ShortcutEvent,
} from './shortcuts';

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

  it('Ctrl+F / Cmd+F は find', () => {
    expect(matchShortcut(ev({ ctrlKey: true, key: 'f' }))).toBe('find');
    expect(matchShortcut(ev({ metaKey: true, key: 'f' }))).toBe('find');
  });

  it('大文字 S / P / F（Shift 無しの CapsLock 等）でも解決する', () => {
    expect(matchShortcut(ev({ ctrlKey: true, key: 'S' }))).toBe('save');
    expect(matchShortcut(ev({ ctrlKey: true, key: 'P' }))).toBe('pdf');
    expect(matchShortcut(ev({ ctrlKey: true, key: 'F' }))).toBe('find');
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

describe('resolvePreviewMessage — プレビュー iframe からの postMessage を解決', () => {
  it('正しい source + action=save は save', () => {
    expect(
      resolvePreviewMessage({ source: PREVIEW_MESSAGE_SOURCE, action: 'save' }),
    ).toBe('save');
  });

  it('正しい source + action=pdf は pdf', () => {
    expect(
      resolvePreviewMessage({ source: PREVIEW_MESSAGE_SOURCE, action: 'pdf' }),
    ).toBe('pdf');
  });

  it('正しい source + action=find は find（iframe 内 Ctrl+F を親へ委譲）', () => {
    expect(
      resolvePreviewMessage({ source: PREVIEW_MESSAGE_SOURCE, action: 'find' }),
    ).toBe('find');
  });

  it('source が一致しなければ null（他フレーム/拡張のメッセージを無視）', () => {
    expect(resolvePreviewMessage({ source: 'other', action: 'save' })).toBeNull();
    expect(resolvePreviewMessage({ action: 'save' })).toBeNull();
  });

  it('未知の action は null', () => {
    expect(
      resolvePreviewMessage({ source: PREVIEW_MESSAGE_SOURCE, action: 'delete' }),
    ).toBeNull();
  });

  it('オブジェクト以外（null / 文字列 / undefined）は null', () => {
    expect(resolvePreviewMessage(null)).toBeNull();
    expect(resolvePreviewMessage('save')).toBeNull();
    expect(resolvePreviewMessage(undefined)).toBeNull();
  });
});
