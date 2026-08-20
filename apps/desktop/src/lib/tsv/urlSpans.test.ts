import { describe, expect, it } from 'vitest';
import { splitUrlSpans, hasUrl } from './urlSpans';

/** 読みやすさのため、切れ目を `[url]` で挟んだ 1 本の文字列に畳む。 */
function show(text: string): string {
  return splitUrlSpans(text)
    .map((span) => (span.url === null ? span.text : `[${span.text}]`))
    .join('');
}

describe('splitUrlSpans', () => {
  it('URL の無い文字列はそのまま 1 つ', () => {
    const spans = splitUrlSpans('ログイン画面を開く');
    expect(spans).toEqual([{ text: 'ログイン画面を開く', url: null }]);
  });

  it('空文字は何も返さない', () => {
    expect(splitUrlSpans('')).toEqual([]);
  });

  it('前後の文と一緒に切り出す', () => {
    expect(show('まず https://example.com/login を開く')).toBe('まず [https://example.com/login] を開く');
  });

  it('押せる先は切り出した文字列そのもの', () => {
    const spans = splitUrlSpans('見る https://example.com/a?b=1#c');
    expect(spans[1]).toEqual({ text: 'https://example.com/a?b=1#c', url: 'https://example.com/a?b=1#c' });
  });

  it('1 つのセルに 2 本あっても両方切り出す', () => {
    expect(show('https://a.example.com と https://b.example.com')).toBe(
      '[https://a.example.com] と [https://b.example.com]',
    );
  });

  it('末尾の句読点は URL に含めない', () => {
    expect(show('https://example.com/x.')).toBe('[https://example.com/x].');
    expect(show('https://example.com/x, つぎ')).toBe('[https://example.com/x], つぎ');
  });

  it('全角の句読点も含めない', () => {
    expect(show('https://example.com/x。')).toBe('[https://example.com/x]。');
  });

  it('日本語がすぐ続いても URL はそこで終わる', () => {
    expect(show('https://example.com/xを開く')).toBe('[https://example.com/x]を開く');
  });

  it('全角の括弧に挟まれていても URL だけを取る', () => {
    expect(show('（https://example.com/x）')).toBe('（[https://example.com/x]）');
  });

  it('半角の括弧で囲われた場合は閉じ括弧を含めない', () => {
    expect(show('(https://example.com/x)')).toBe('([https://example.com/x])');
  });

  it('URL の中の対になった括弧は残す', () => {
    expect(show('https://example.com/a_(b)')).toBe('[https://example.com/a_(b)]');
  });

  it('http も見る', () => {
    expect(show('http://example.com/')).toBe('[http://example.com/]');
  });

  it('scheme だけでは URL にしない', () => {
    expect(show('https:// を書く')).toBe('https:// を書く');
  });

  it('文字の途中にある https は URL にしない', () => {
    expect(show('xhttps://example.com')).toBe('xhttps://example.com');
  });

  it('別の scheme は見ない（追えない先を押せる形にしない）', () => {
    expect(show('ftp://example.com/x')).toBe('ftp://example.com/x');
  });
});

describe('hasUrl', () => {
  it('あるときだけ true', () => {
    expect(hasUrl('見る https://example.com')).toBe(true);
    expect(hasUrl('見る')).toBe(false);
  });
});
