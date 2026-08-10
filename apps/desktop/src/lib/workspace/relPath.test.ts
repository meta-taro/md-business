import { describe, expect, it } from 'vitest';
import { resolveRelPath } from './relPath';

describe('resolveRelPath', () => {
  it('開いているファイルと同じ場所を指す', () => {
    expect(resolveRelPath('docs/test-specs/001-login.tsv', '002-signup.tsv')).toBe(
      'docs/test-specs/002-signup.tsv',
    );
  });

  it('上へ戻ってから下りる', () => {
    expect(resolveRelPath('docs/test-specs/001-login.tsv', '../specs/order.md')).toBe(
      'docs/specs/order.md',
    );
  });

  it('. と ./ を畳む', () => {
    expect(resolveRelPath('docs/a.tsv', './b.tsv')).toBe('docs/b.tsv');
    expect(resolveRelPath('docs/a.tsv', 'sub/./b.tsv')).toBe('docs/sub/b.tsv');
    expect(resolveRelPath('docs/sub/a.tsv', '../.././docs/b.tsv')).toBe('docs/b.tsv');
  });

  it('ルート直下のファイルからも解ける', () => {
    expect(resolveRelPath('a.tsv', 'docs/b.tsv')).toBe('docs/b.tsv');
  });

  // ルートの外は開けない。開こうとした事実を握り潰さないよう null で返す。
  it('ルートの外へ出る指し先は解かない', () => {
    expect(resolveRelPath('a.tsv', '../b.tsv')).toBeNull();
    expect(resolveRelPath('docs/a.tsv', '../../b.tsv')).toBeNull();
  });

  it('開いているファイルが無ければ解かない', () => {
    expect(resolveRelPath(null, 'docs/b.tsv')).toBeNull();
  });

  it('指し先が空なら解かない', () => {
    expect(resolveRelPath('docs/a.tsv', '')).toBeNull();
    expect(resolveRelPath('docs/a.tsv', '   ')).toBeNull();
  });

  // 書いた人の環境でだけ動く形にしない（Windows で入力すると区切りが \ になる）。
  it('区切りが \\ でも解く', () => {
    expect(resolveRelPath('docs\\test-specs\\001-login.tsv', '..\\specs\\order.md')).toBe(
      'docs/specs/order.md',
    );
  });

  // 畳んだ結果がフォルダになる形は、開くファイルが決まらない。
  it('ファイルにならない指し先は解かない', () => {
    expect(resolveRelPath('docs/a.tsv', '..')).toBeNull();
    expect(resolveRelPath('docs/sub/a.tsv', '../')).toBeNull();
  });
});
