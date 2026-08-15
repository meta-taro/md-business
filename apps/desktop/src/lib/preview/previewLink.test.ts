import { describe, it, expect } from 'vitest';
import { resolvePreviewLink } from './previewLink';

describe('resolvePreviewLink', () => {
  it('http / https はブラウザで開く', () => {
    expect(resolvePreviewLink('https://example.com/a')).toEqual({
      kind: 'external',
      href: 'https://example.com/a',
    });
    expect(resolvePreviewLink('http://example.com')).toEqual({
      kind: 'external',
      href: 'http://example.com',
    });
  });

  it('相対パスはワークスペースの文書として開く', () => {
    expect(resolvePreviewLink('evidence/EV-001.md')).toEqual({
      kind: 'document',
      path: 'evidence/EV-001.md',
    });
    expect(resolvePreviewLink('../logs/app.jsonl')).toEqual({
      kind: 'document',
      path: '../logs/app.jsonl',
    });
    expect(resolvePreviewLink('./a.md')).toEqual({ kind: 'document', path: './a.md' });
  });

  it('相対パスの後ろの # と ? は落として指し先だけを取る', () => {
    expect(resolvePreviewLink('evidence/EV-001.md#所見')).toEqual({
      kind: 'document',
      path: 'evidence/EV-001.md',
    });
    expect(resolvePreviewLink('a.md?v=1')).toEqual({ kind: 'document', path: 'a.md' });
  });

  it('同じ文書の中の移動は横取りしない', () => {
    // ブラウザ既定のアンカー移動がそのまま正しい。奪うと動かなくなる。
    expect(resolvePreviewLink('#section-1')).toBeNull();
  });

  it('http / https 以外のスキームは開かず、押されたことは握り潰す', () => {
    // null（＝既定に任せる）にすると、javascript: が枠の中でそのまま走る。
    expect(resolvePreviewLink('javascript:alert(1)')).toEqual({
      kind: 'blocked',
      href: 'javascript:alert(1)',
    });
    expect(resolvePreviewLink('file:///etc/passwd')?.kind).toBe('blocked');
    expect(resolvePreviewLink('data:text/html,<b>x</b>')?.kind).toBe('blocked');
    expect(resolvePreviewLink('mailto:x@example.com')?.kind).toBe('blocked');
    // Windows の絶対パスもスキーム付きに見える。どちらにせよ開かない。
    expect(resolvePreviewLink('C:\\Users\\a.md')?.kind).toBe('blocked');
  });

  it('ルートからの絶対パスは開かない', () => {
    // 「/」がワークスペースのルートなのか OS のルートなのかを決められない。
    expect(resolvePreviewLink('/etc/passwd')?.kind).toBe('blocked');
    expect(resolvePreviewLink('//example.com/a')?.kind).toBe('blocked');
  });

  it('空は追わない', () => {
    expect(resolvePreviewLink('')).toBeNull();
    expect(resolvePreviewLink('   ')).toBeNull();
    expect(resolvePreviewLink('#')).toBeNull();
    // 指し先が # や ? しか無い形も、その場に留まる指示として扱う。
    expect(resolvePreviewLink('?v=1')).toBeNull();
  });
});
