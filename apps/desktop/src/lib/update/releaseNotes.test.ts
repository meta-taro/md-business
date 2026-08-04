// @vitest-environment jsdom
//
// リリースノートは HTML 化して sanitize（DOMPurify）するため window が要る。
// よって markdownFallback.test と同じく jsdom に切り替える。
import { describe, it, expect } from 'vitest';
import { renderReleaseNotes, externalLinkHref } from './releaseNotes';

describe('renderReleaseNotes — 更新ダイアログのリリースノート', () => {
  it('Markdown を HTML にする', () => {
    // 素のまま出すと、記号（## や -）が本文に混ざったまま利用者に見える。
    const html = renderReleaseNotes(['## 変更点', '', '- 表の列寄せを指定できるようにした'].join('\n'));
    expect(html).toContain('<h2>');
    expect(html).toContain('<li>');
    expect(html).not.toContain('## 変更点');
  });

  it('本文が空なら空のまま返す', () => {
    // 呼び出し側は中身の有無で見出しごと出し分ける。空白だけで枠が出ないようにする。
    expect(renderReleaseNotes('')).toBe('');
    expect(renderReleaseNotes('   \n  ')).toBe('');
  });

  it('javascript: のリンクは落とす', () => {
    // ノートは配信元の JSON から来る文字列で、署名が守るのは配布物のほう。
    // しかもこの HTML はアプリ本体の文書へ直接差し込むので、iframe の隔離が効かない。
    const html = renderReleaseNotes('[押して](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('スクリプトは落とす', () => {
    const html = renderReleaseNotes('<script>alert(1)</script>\n\n本文');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('本文');
  });
});

describe('externalLinkHref — ノート内リンクの行き先', () => {
  function anchor(html: string): Element {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.querySelector('*') as Element;
  }

  it('リンクの中を押しても、そのリンクの行き先が取れる', () => {
    // 押される先は <a> 自身とは限らない（<code> や <strong> で包まれている）。
    const el = anchor('<a href="https://example.com/notes"><code>v0.6.0</code></a>');
    expect(externalLinkHref(el.querySelector('code'))).toBe('https://example.com/notes');
  });

  it('リンクでないところを押しても何も返さない', () => {
    expect(externalLinkHref(anchor('<p>本文</p>'))).toBeNull();
    expect(externalLinkHref(null)).toBeNull();
  });

  it('http(s) 以外は返さない', () => {
    // 既定のアプリで開く経路なので、行き先を web に限る。
    expect(externalLinkHref(anchor('<a href="file:///C:/Windows">開く</a>'))).toBeNull();
  });
});
