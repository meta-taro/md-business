import { describe, expect, it } from 'vitest';
import { collectImageRefs, inlineImages, resolveImagePath } from './inlineImages';

const png = 'data:image/png;base64,AAAA';

describe('collectImageRefs', () => {
  it('本文に置いた画像の参照を拾う', () => {
    const refs = collectImageRefs('見出し\n\n![領収書](./2026-08-19.png)\n');
    expect(refs).toEqual([{ raw: './2026-08-19.png', ref: './2026-08-19.png' }]);
  });

  it('題名付きでも拾う', () => {
    expect(collectImageRefs('![図](fig.png "説明")')).toEqual([{ raw: 'fig.png', ref: 'fig.png' }]);
  });

  it('山括弧で囲った参照は中身を取り、percent 符号は戻す', () => {
    expect(collectImageRefs('![](<a b.png>)')).toEqual([{ raw: '<a b.png>', ref: 'a b.png' }]);
    expect(collectImageRefs('![](%E5%9B%B3.png)')).toEqual([
      { raw: '%E5%9B%B3.png', ref: '図.png' },
    ]);
  });

  // 手順書には記法そのものを書くことがある。書いてあるとおりに見せる場所なので、
  // ここで画像に変えると、説明していた記法が消える。
  it('コードブロックの中は拾わない', () => {
    const md = ['```md', '![図](a.png)', '```', '', '~~~', '![図](b.png)', '~~~'].join('\n');
    expect(collectImageRefs(md)).toEqual([]);
  });

  it('行内のコードは拾わない', () => {
    expect(collectImageRefs('書き方は `![図](a.png)` です。')).toEqual([]);
  });

  it('外から取ってくる参照は拾わない（読むのは開いているフォルダの中だけ）', () => {
    const md = ['![](https://example.com/a.png)', `![](${png})`, '![](//example.com/a.png)'].join(
      '\n',
    );
    expect(collectImageRefs(md)).toEqual([]);
  });

  it('画像でない参照は拾わない', () => {
    expect(collectImageRefs('[別紙](./spec.md)\n![](./notes.md)')).toEqual([]);
  });

  it('同じ画像を 2 回置いても 1 件として返す', () => {
    expect(collectImageRefs('![](a.png)\n![](a.png)')).toEqual([{ raw: 'a.png', ref: 'a.png' }]);
  });
});

describe('resolveImagePath', () => {
  it('文書と同じ場所からの相対で解決する', () => {
    expect(resolveImagePath('docs/expenses/2026-08.md', './領収書.png')).toBe(
      'docs/expenses/領収書.png',
    );
    expect(resolveImagePath('docs/expenses/2026-08.md', 'img/a.png')).toBe(
      'docs/expenses/img/a.png',
    );
  });

  it('上の階層へ戻れる', () => {
    expect(resolveImagePath('docs/expenses/2026-08.md', '../img/a.png')).toBe('docs/img/a.png');
  });

  // 開いているフォルダの外は読み取り側でも拒まれるが、そこまで持って行かない。
  it('開いているフォルダの外へ出る参照は解決しない', () => {
    expect(resolveImagePath('docs/a.md', '../../secret.png')).toBeNull();
    expect(resolveImagePath('a.md', '../secret.png')).toBeNull();
  });

  it('区切りが円記号でも解決する', () => {
    expect(resolveImagePath('docs\\a.md', 'img\\b.png')).toBe('docs/img/b.png');
  });
});

describe('inlineImages', () => {
  it('読めた画像だけを埋め込み、読めなかったものはそのまま残す', () => {
    const md = '![領収書](./a.png)\n![控え](./b.png)\n';
    const out = inlineImages(md, new Map([['./a.png', png]]));
    expect(out).toBe(`![領収書](${png})\n![控え](./b.png)\n`);
  });

  it('題名は残す', () => {
    expect(inlineImages('![図](fig.png "説明")', new Map([['fig.png', png]]))).toBe(
      `![図](${png} "説明")`,
    );
  });

  it('コードブロックの中は書き換えない', () => {
    const md = ['```md', '![図](a.png)', '```', '![図](a.png)'].join('\n');
    const out = inlineImages(md, new Map([['a.png', png]]));
    expect(out).toBe(['```md', '![図](a.png)', '```', `![図](${png})`].join('\n'));
  });

  it('埋め込むものが無ければ本文をそのまま返す', () => {
    const md = '# 見出し\n\n本文\n';
    expect(inlineImages(md, new Map())).toBe(md);
  });
});

describe('HTML で書いた画像', () => {
  it('src を拾う', () => {
    expect(collectImageRefs('<img src="./図.png" alt="図">')).toEqual([
      { raw: './図.png', ref: './図.png' },
    ]);
  });

  it('引用符の種類と属性の並びを問わない', () => {
    expect(collectImageRefs("<img alt='図' width=320 src='a.png' />")).toEqual([
      { raw: 'a.png', ref: 'a.png' },
    ]);
    expect(collectImageRefs('<img src=b.png>')).toEqual([{ raw: 'b.png', ref: 'b.png' }]);
  });

  it('外を指すものと画像でないものは拾わない', () => {
    expect(collectImageRefs('<img src="https://example.com/a.png">')).toEqual([]);
    expect(collectImageRefs('<img src="note.md">')).toEqual([]);
  });

  it('コードブロックの中は拾わない', () => {
    const md = ['```html', '<img src="a.png">', '```'].join('\n');
    expect(collectImageRefs(md)).toEqual([]);
  });

  it('読めた画像に差し替える', () => {
    const out = inlineImages('<img src="a.png" alt="図">', new Map([['a.png', png]]));
    expect(out).toBe(`<img src="${png}" alt="図">`);
  });

  it('読めなかった画像は書かれたまま残す', () => {
    const md = '<img src="a.png"><img src="b.png">';
    expect(inlineImages(md, new Map([['a.png', png]]))).toBe(
      `<img src="${png}"><img src="b.png">`,
    );
  });
});
