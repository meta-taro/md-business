import { describe, expect, it, vi } from 'vitest';
import { createDesktopOpener, resolveAppPath } from './desktopOpener.js';

describe('resolveAppPath', () => {
  it('環境変数の指定を最優先で使う', () => {
    const found = resolveAppPath({
      env: { MD_BUSINESS_APP: 'D:/custom/app.exe' },
      platform: 'win32',
      exists: (p) => p === 'D:/custom/app.exe',
    });
    expect(found).toBe('D:/custom/app.exe');
  });

  it('環境変数の指す先が無ければ、既定の場所を探す', () => {
    const installed = 'C:\\Users\\u\\AppData\\Local\\md-business\\md-business-desktop.exe';
    const found = resolveAppPath({
      env: { MD_BUSINESS_APP: 'D:/none.exe', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' },
      platform: 'win32',
      exists: (p) => p === installed,
    });
    expect(found).toBe(installed);
  });

  it('Windows は Program Files も見る', () => {
    const installed = 'C:\\Program Files\\md-business\\md-business-desktop.exe';
    const found = resolveAppPath({
      env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', ProgramFiles: 'C:\\Program Files' },
      platform: 'win32',
      exists: (p) => p === installed,
    });
    expect(found).toBe(installed);
  });

  it('macOS はアプリケーションフォルダの中の実行ファイルを指す', () => {
    const installed = '/Applications/md-business.app/Contents/MacOS/md-business-desktop';
    const found = resolveAppPath({
      env: { HOME: '/Users/u' },
      platform: 'darwin',
      exists: (p) => p === installed,
    });
    expect(found).toBe(installed);
  });

  it('Linux は PATH に置かれる位置を見る', () => {
    const installed = '/usr/bin/md-business-desktop';
    const found = resolveAppPath({
      env: { HOME: '/home/u' },
      platform: 'linux',
      exists: (p) => p === installed,
    });
    expect(found).toBe(installed);
  });

  it('どこにも無ければ null', () => {
    expect(resolveAppPath({ env: {}, platform: 'win32', exists: () => false })).toBeNull();
  });
});

describe('createDesktopOpener', () => {
  const base = {
    getRoot: () => 'C:\\work',
    join: (...parts: string[]) => parts.join('\\'),
    env: { MD_BUSINESS_APP: 'C:\\app.exe' },
    platform: 'win32' as const,
    exists: () => true,
  };

  it('root からの絶対パスを引数にしてアプリを起こす', async () => {
    const spawn = vi.fn();
    const opener = createDesktopOpener({ ...base, spawn });
    const result = await opener.open('docs/test-specs/001-login.tsv');
    expect(result).toEqual({ ok: true, path: 'docs/test-specs/001-login.tsv' });
    expect(spawn).toHaveBeenCalledWith('C:\\app.exe', [
      'C:\\work\\docs/test-specs/001-login.tsv',
    ]);
  });

  it('開くたびに root を読み直す', async () => {
    const spawn = vi.fn();
    let root = 'C:\\a';
    const opener = createDesktopOpener({ ...base, getRoot: () => root, spawn });
    await opener.open('x.tsv');
    root = 'C:\\b';
    await opener.open('x.tsv');
    expect(spawn.mock.calls[1]?.[1]).toEqual(['C:\\b\\x.tsv']);
  });

  it('ワークスペースの外を指す相対パスは断る', async () => {
    const spawn = vi.fn();
    const opener = createDesktopOpener({ ...base, spawn });
    const result = await opener.open('../secrets.tsv');
    expect(result.ok).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('無いファイルを頼まれたら、起こす前に断る', async () => {
    // 起こすだけの口なので、アプリが受け取ったかは返ってこない。ここで確かめずに通すと、
    // 打ち間違いでも ok が返り、頼んだ側は「開いた」と思ったまま先へ進む。
    const spawn = vi.fn();
    const opener = createDesktopOpener({
      ...base,
      exists: (path: string) => path.endsWith('app.exe'),
      spawn,
    });
    const result = await opener.open('docs/none.tsv');
    expect(result.ok).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('アプリが見つからなければ、探した場所が分かる理由を返す', async () => {
    const spawn = vi.fn();
    const opener = createDesktopOpener({ ...base, env: {}, exists: () => false, spawn });
    const result = await opener.open('a.tsv');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('MD_BUSINESS_APP');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('起動そのものが失敗したら、その理由を返す', async () => {
    const opener = createDesktopOpener({
      ...base,
      spawn: () => {
        throw new Error('EACCES');
      },
    });
    const result = await opener.open('a.tsv');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('EACCES');
  });
});
