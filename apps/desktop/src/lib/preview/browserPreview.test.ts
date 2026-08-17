import { describe, it, expect } from 'vitest';
import { affectsSite, shouldStop } from './browserPreview';

describe('affectsSite', () => {
  it('サイトに載るのは .md だけ', () => {
    expect(affectsSite('docs/仕様.md')).toBe(true);
    expect(affectsSite('README.MD')).toBe(true);
  });

  // 検証シートも参考データもページにならない（siteDocumentPaths と同じ線）。
  // 変わるたびに組み直すと、表を 1 セット打っている間ずっと組み直しが走る。
  it('ページにならないものが変わっても組み直さない', () => {
    expect(affectsSite('docs/test-specs/001-login.tsv')).toBe(false);
    expect(affectsSite('data/口座.json')).toBe(false);
    expect(affectsSite('画像.png')).toBe(false);
  });

  // 書き出した先の変化で組み直すと、書き出すたびに組み直しが起きる。
  it('書き出し先の変化では組み直さない', () => {
    expect(affectsSite('dist/index.html')).toBe(false);
    expect(affectsSite('dist/a.md')).toBe(false);
  });
});

describe('shouldStop', () => {
  it('開いているフォルダが変わったら畳む', () => {
    expect(shouldStop('C:/work/a', 'C:/work/b')).toBe(true);
  });

  // 別のフォルダの中身を、前のフォルダの URL で見せ続けることになる。
  it('フォルダを閉じたら畳む', () => {
    expect(shouldStop('C:/work/a', null)).toBe(true);
  });

  it('同じフォルダのままなら畳まない', () => {
    expect(shouldStop('C:/work/a', 'C:/work/a')).toBe(false);
  });
});
