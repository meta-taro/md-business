import { describe, expect, it } from 'vitest';
import { buildShareLink, parseShareLink, resolveShareFolder } from './shareLink';

describe('buildShareLink', () => {
  it('リポジトリ名・パス・ブランチを並べる', () => {
    const link = buildShareLink({ repo: 'github.com/o/r', path: 'docs/a.tsv', ref: 'main' });
    expect(link).toBe('md-business://open?repo=github.com/o/r&path=docs/a.tsv&ref=main');
  });

  it('ブランチが分からなければ付けない', () => {
    const link = buildShareLink({ repo: 'github.com/o/r', path: 'a.tsv', ref: null });
    expect(link).toBe('md-business://open?repo=github.com/o/r&path=a.tsv');
  });

  it('行と行 ID を添えられる', () => {
    const link = buildShareLink({
      repo: 'github.com/o/r',
      path: 'a.tsv',
      ref: null,
      line: 12,
      id: 'r1b2c838a2314',
    });
    expect(link).toBe('md-business://open?repo=github.com/o/r&path=a.tsv&line=12&id=r1b2c838a2314');
  });

  it('そのままでは意味が変わる文字は逃がす', () => {
    const link = buildShareLink({ repo: 'github.com/o/r', path: 'docs/a b&c.tsv', ref: null });
    expect(link).toBe('md-business://open?repo=github.com/o/r&path=docs/a%20b%26c.tsv');
  });
});

describe('parseShareLink', () => {
  it('組み立てたリンクは元に戻せる', () => {
    const target = { repo: 'github.com/o/r', path: 'docs/検証 一覧.tsv', ref: 'feature/x' };
    expect(parseShareLink(buildShareLink(target))).toEqual(target);
  });

  it('ブランチが無ければ null', () => {
    const got = parseShareLink('md-business://open?repo=github.com/o/r&path=a.tsv');
    expect(got).toEqual({ repo: 'github.com/o/r', path: 'a.tsv', ref: null });
  });

  it('大文字で書かれていても受け取る', () => {
    const got = parseShareLink('MD-BUSINESS://OPEN?repo=github.com/o/r&path=a.tsv');
    expect(got?.path).toBe('a.tsv');
  });

  it('別のスキームは受け取らない', () => {
    expect(parseShareLink('https://github.com/o/r/blob/main/a.tsv')).toBeNull();
  });

  it('open 以外の指示は受け取らない', () => {
    expect(parseShareLink('md-business://run?repo=github.com/o/r&path=a.tsv')).toBeNull();
  });

  it('リポジトリかパスが欠けていれば受け取らない', () => {
    expect(parseShareLink('md-business://open?path=a.tsv')).toBeNull();
    expect(parseShareLink('md-business://open?repo=github.com/o/r')).toBeNull();
  });

  it('親をたどるパスは受け取らない', () => {
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=../../.ssh/id_rsa')).toBeNull();
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=docs/../../x.tsv')).toBeNull();
  });

  it('絶対パスは受け取らない', () => {
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=/etc/passwd')).toBeNull();
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=//srv/share/x.tsv')).toBeNull();
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=C:/Windows/x.tsv')).toBeNull();
  });

  it('符号化して紛れ込ませた制御文字は受け取らない', () => {
    // %00 / %0A は素の文字では書けないが、符号化すれば読み取り後に現れる。
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=docs/a%00.tsv')).toBeNull();
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=docs/a%0A.tsv')).toBeNull();
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=docs/a%09.tsv')).toBeNull();
  });

  it('符号化して紛れ込ませた円記号・親をたどる印は受け取らない', () => {
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=docs%5Ca.tsv')).toBeNull();
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=docs/%2E%2E/x.tsv')).toBeNull();
  });

  it('コロンを含む名前は受け取らない', () => {
    // NTFS の代替データストリーム。開けたように見えて、中身は本体ファイルの裏側に入る。
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=docs/a.tsv:evil')).toBeNull();
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=docs/%3Ahidden')).toBeNull();
  });

  it('予約デバイス名は受け取らない', () => {
    for (const name of ['con', 'CON', 'con.md', 'aux.tsv', 'nul', 'com1', 'LPT9']) {
      expect(
        parseShareLink(`md-business://open?repo=github.com/o/r&path=docs/${name}`),
        name,
      ).toBeNull();
    }
  });

  it('予約デバイス名に見えるだけの名前は受け取る', () => {
    expect(
      parseShareLink('md-business://open?repo=github.com/o/r&path=docs/console.md')?.path,
    ).toBe('docs/console.md');
  });

  it('円記号区切りは受け取らない', () => {
    expect(parseShareLink('md-business://open?repo=github.com/o/r&path=docs\\a.tsv')).toBeNull();
  });

  it('リポジトリ名にホストと名前が揃っていなければ受け取らない', () => {
    expect(parseShareLink('md-business://open?repo=github.com&path=a.tsv')).toBeNull();
    expect(parseShareLink('md-business://open?repo=github.com/../o/r&path=a.tsv')).toBeNull();
  });

  it('行と行 ID を読む', () => {
    const got = parseShareLink('md-business://open?repo=github.com/o/r&path=a.tsv&line=12&id=r1b2c838a2314');
    expect(got).toEqual({ repo: 'github.com/o/r', path: 'a.tsv', ref: null, line: 12, id: 'r1b2c838a2314' });
  });

  it('行と行 ID を添えたリンクも元に戻せる', () => {
    const target = { repo: 'github.com/o/r', path: 'a.tsv', ref: 'main', line: 3, id: 'r0123456789ab' };
    expect(parseShareLink(buildShareLink(target))).toEqual(target);
  });

  it('行番号として読めないものは、行を落として受け取る', () => {
    for (const line of ['0', '-1', '1.5', 'abc', '', '1e3', '99999999999']) {
      const got = parseShareLink(`md-business://open?repo=github.com/o/r&path=a.tsv&line=${line}`);
      expect(got, line).toEqual({ repo: 'github.com/o/r', path: 'a.tsv', ref: null });
    }
  });

  it('行 ID の形でないものは、ID を落として受け取る', () => {
    for (const id of ['abc', 'r123', 'R1B2C838A2314', 'r1b2c838a2314x', '../x']) {
      const got = parseShareLink(
        `md-business://open?repo=github.com/o/r&path=a.tsv&id=${encodeURIComponent(id)}`,
      );
      expect(got, id).toEqual({ repo: 'github.com/o/r', path: 'a.tsv', ref: null });
    }
  });

  it('ブランチ名として無理のあるものは、名前を落として受け取る', () => {
    const got = parseShareLink('md-business://open?repo=github.com/o/r&path=a.tsv&ref=--upload-pack=x');
    expect(got).toEqual({ repo: 'github.com/o/r', path: 'a.tsv', ref: null });
  });
});

describe('resolveShareFolder', () => {
  const target = { repo: 'github.com/o/r', path: 'docs/a.tsv', ref: null };

  it('いま開いているフォルダが同じリポジトリなら、そこで開く', () => {
    const got = resolveShareFolder(target, [
      { folder: 'C:\\work\\r', repo: 'github.com/o/r', prefix: '', current: true },
    ]);
    expect(got).toEqual({ folder: 'C:\\work\\r', relPath: 'docs/a.tsv' });
  });

  it('いま開いていなくても、以前に開いたフォルダから探す', () => {
    const got = resolveShareFolder(target, [
      { folder: 'C:\\work\\other', repo: 'github.com/o/other', prefix: '', current: true },
      { folder: 'C:\\work\\r', repo: 'github.com/o/r', prefix: '', current: false },
    ]);
    expect(got).toEqual({ folder: 'C:\\work\\r', relPath: 'docs/a.tsv' });
  });

  it('リポジトリ名の大文字小文字は区別しない', () => {
    const got = resolveShareFolder(target, [
      { folder: 'C:\\work\\r', repo: 'GitHub.com/O/R', prefix: '', current: false },
    ]);
    expect(got?.folder).toBe('C:\\work\\r');
  });

  it('同じリポジトリが複数あれば、いま開いているものを選ぶ', () => {
    const got = resolveShareFolder(target, [
      { folder: 'C:\\clone1', repo: 'github.com/o/r', prefix: '', current: false },
      { folder: 'C:\\clone2', repo: 'github.com/o/r', prefix: '', current: true },
    ]);
    expect(got?.folder).toBe('C:\\clone2');
  });

  it('リポジトリの一部だけを開いていれば、その中の分を切り出す', () => {
    const got = resolveShareFolder(target, [
      { folder: 'C:\\work\\r\\docs', repo: 'github.com/o/r', prefix: 'docs/', current: true },
    ]);
    expect(got).toEqual({ folder: 'C:\\work\\r\\docs', relPath: 'a.tsv' });
  });

  it('開いている範囲の外を指されたら、そのフォルダは選ばない', () => {
    const got = resolveShareFolder(target, [
      { folder: 'C:\\work\\r\\src', repo: 'github.com/o/r', prefix: 'src/', current: true },
    ]);
    expect(got).toBeNull();
  });

  it('リポジトリが違えば選ばない', () => {
    const got = resolveShareFolder(target, [
      { folder: 'C:\\work\\x', repo: 'github.com/o/x', prefix: '', current: true },
    ]);
    expect(got).toBeNull();
  });

  it('候補が無ければ選ばない', () => {
    expect(resolveShareFolder(target, [])).toBeNull();
  });
});
