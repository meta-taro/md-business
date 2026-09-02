import { describe, expect, it } from 'vitest';
import { livePreviewUrl, paneOrigin, sitePartView } from './livePreview';

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

describe('sitePartView', () => {
  const DEV = 'http://localhost:4321/';

  it('待ち受けが立っていればそこへ向ける', () => {
    expect(
      sitePartView({
        liveUrl: `${BASE}index.html`,
        devServer: null,
        devAnswering: false,
        declaredWeb: true,
      }),
    ).toEqual({ kind: 'live', url: `${BASE}index.html` });
  });

  it('立っていなければ立てる口を出す', () => {
    expect(
      sitePartView({ liveUrl: null, devServer: null, devAnswering: false, declaredWeb: true }),
    ).toEqual({ kind: 'start' });
  });

  it('web モードを宣言していないフォルダでは立てる口も出さない', () => {
    expect(
      sitePartView({ liveUrl: null, devServer: null, devAnswering: false, declaredWeb: false }),
    ).toEqual({ kind: 'declare' });
  });

  it('宣言された待ち受けが応えていれば、そこを映す', () => {
    expect(
      sitePartView({ liveUrl: null, devServer: DEV, devAnswering: true, declaredWeb: true }),
    ).toEqual({ kind: 'dev', url: DEV });
  });

  // 宣言した在り処と違うものを黙って映すと、どちらが本当かを確かめる先が 2 つになる。
  it('応えていなければ、そう言う。手元の待ち受けへすり替えない', () => {
    expect(
      sitePartView({
        liveUrl: `${BASE}index.html`,
        devServer: DEV,
        devAnswering: false,
        declaredWeb: true,
      }),
    ).toEqual({ kind: 'dev-down', url: DEV });
  });

  it('宣言された待ち受けは、手元で立てたものより先に映す', () => {
    expect(
      sitePartView({
        liveUrl: `${BASE}index.html`,
        devServer: DEV,
        devAnswering: true,
        declaredWeb: true,
      }),
    ).toEqual({ kind: 'dev', url: DEV });
  });
});

describe('paneOrigin', () => {
  const DEV = 'http://localhost:4321';

  it('アプリの中で組んだものを出しているときは、在り処を持たない', () => {
    expect(paneOrigin(null, null)).toEqual({ kind: 'built' });
  });

  // 出どころを書かないと、面に映っているものがアプリの中で組んだものなのか、
  // 立っている待ち受けから来たものなのか、見ただけでは分からない。
  it('待ち受けを映しているときは、その在り処を返す', () => {
    expect(paneOrigin(`${BASE}index.html`, null)).toEqual({
      kind: 'live',
      url: `${BASE}index.html`,
      elsewhere: null,
    });
  });

  // 待ち受けが 2 つ立っていることがある（アプリが立てたものと、宣言された自前のもの）。
  // 見出しに 1 つしか出さないと、もう一方がどこへ行ったのか読めない。
  it('宣言された待ち受けがあるなら、映していなくても在り処を添える', () => {
    expect(paneOrigin(`${BASE}index.html`, DEV)).toEqual({
      kind: 'live',
      url: `${BASE}index.html`,
      elsewhere: DEV,
    });
  });

  // 組んだものを出している面は、そもそも待ち受けの話をしていない。
  it('組んだものを出しているなら、宣言があっても添えない', () => {
    expect(paneOrigin(null, DEV)).toEqual({ kind: 'built' });
  });
});
