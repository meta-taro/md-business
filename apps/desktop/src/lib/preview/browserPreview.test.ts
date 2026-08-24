import { describe, it, expect } from 'vitest';
import { affectsSite, shouldStop } from './browserPreview';

describe('affectsSite', () => {
  it('ページになるものが変わったら組み直す', () => {
    expect(affectsSite('docs/仕様.md')).toBe(true);
    expect(affectsSite('README.MD')).toBe(true);
  });

  // ページ以外もサイトの一部として出るので、変わったら読み直させる。
  // ここで落とすと、直したのに開いたままの窓が古いままになる。
  it('ページ以外が変わっても組み直す', () => {
    expect(affectsSite('style.css')).toBe(true);
    expect(affectsSite('js/app.js')).toBe(true);
    expect(affectsSite('about.html')).toBe(true);
    expect(affectsSite('docs/test-specs/001-login.tsv')).toBe(true);
    expect(affectsSite('data/口座.json')).toBe(true);
    expect(affectsSite('画像.png')).toBe(true);
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
