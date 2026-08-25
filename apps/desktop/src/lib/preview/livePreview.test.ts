import { describe, expect, it } from 'vitest';
import { livePreviewUrl } from './livePreview';

/** この PC の区切り。文字として書くと読む側で消えるので、符号から作る。 */
const SEP = String.fromCharCode(92);

const BASE = 'http://127.0.0.1:5321/abcdef/';

describe('livePreviewUrl', () => {
  it('待ち受けが立っていなければ映さない', () => {
    expect(livePreviewUrl({ base: null, web: true, relPath: 'a.md' })).toBe(null);
  });

  it('業務文書として出しているものは映さない', () => {
    // web モードでない間は、これまでどおりアプリの中で組んだものを見せる。
    expect(livePreviewUrl({ base: BASE, web: false, relPath: 'a.md' })).toBe(null);
  });

  it('何も開いていなければ入口を出す', () => {
    expect(livePreviewUrl({ base: BASE, web: true, relPath: null })).toBe(BASE);
  });

  it('本文はページになった先を指す', () => {
    expect(livePreviewUrl({ base: BASE, web: true, relPath: 'docs/a.md' })).toBe(
      `${BASE}docs/a.html`,
    );
  });

  it('書いた HTML はそのまま指す', () => {
    expect(livePreviewUrl({ base: BASE, web: true, relPath: 'index.html' })).toBe(
      `${BASE}index.html`,
    );
  });

  it('ページにならないものは入口を出す', () => {
    // CSS や JS をそのまま映しても読む面にならない。組み上がった側を見せる。
    expect(livePreviewUrl({ base: BASE, web: true, relPath: 'style.css' })).toBe(BASE);
  });

  it('名前は区切りごとに符号化する', () => {
    expect(livePreviewUrl({ base: BASE, web: true, relPath: '設計/概要.md' })).toBe(
      `${BASE}${encodeURIComponent('設計')}/${encodeURIComponent('概要')}.html`,
    );
  });

  it('区切りが円記号でも同じ先を指す', () => {
    expect(livePreviewUrl({ base: BASE, web: true, relPath: `docs${SEP}a.md` })).toBe(
      `${BASE}docs/a.html`,
    );
  });

  it('入口の末尾に区切りが無くても繋がる', () => {
    expect(livePreviewUrl({ base: 'http://127.0.0.1:5321/abcdef', web: true, relPath: 'a.md' })).toBe(
      `${BASE}a.html`,
    );
  });

  it('サイトの外へ出る指定は入口へ落とす', () => {
    expect(livePreviewUrl({ base: BASE, web: true, relPath: '../外.md' })).toBe(BASE);
  });
});
