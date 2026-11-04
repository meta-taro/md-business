import { describe, expect, it } from 'vitest';
import { documentName, repoIdFromRemote } from './documentName';

describe('repoIdFromRemote', () => {
  it('reads https remotes and drops credentials, port and .git', () => {
    expect(repoIdFromRemote('https://user:secret@GitHub.com:443/meta-taro/md-business.git')).toBe(
      'github.com/meta-taro/md-business',
    );
  });

  it('reads scp-like ssh remotes', () => {
    expect(repoIdFromRemote('git@github.com:meta-taro/md-business.git')).toBe('github.com/meta-taro/md-business');
  });

  it('reads ssh:// remotes the same way as https ones', () => {
    expect(repoIdFromRemote('ssh://git@github.com:22/meta-taro/md-business')).toBe(
      'github.com/meta-taro/md-business',
    );
  });

  it('refuses local paths, which carry the machine user name and mean nothing elsewhere', () => {
    expect(repoIdFromRemote('C:\\Users\\someone\\repos\\a')).toBeNull();
    expect(repoIdFromRemote('/home/someone/repos/a.git')).toBeNull();
    expect(repoIdFromRemote('file:///home/someone/repos/a.git')).toBeNull();
  });

  it('refuses a remote without a repository path', () => {
    expect(repoIdFromRemote('https://github.com/')).toBeNull();
  });
});

describe('documentName', () => {
  const remotes = [
    { name: 'upstream', url: 'https://github.com/other/fork.git' },
    { name: 'origin', url: 'git@github.com:meta-taro/md-business.git' },
  ];

  it('joins the origin repository and the workspace-relative path', () => {
    expect(documentName(remotes, 'docs\\a.md')).toBe('github.com/meta-taro/md-business#docs/a.md');
  });

  it('falls back to the first remote by name when there is no origin', () => {
    const named = [
      { name: 'zeta', url: 'https://example.com/z/z.git' },
      { name: 'alpha', url: 'https://example.com/a/a.git' },
    ];
    expect(documentName(named, 'a.md')).toBe('example.com/a/a#a.md');
  });

  it('sends nothing for a workspace without a usable remote', () => {
    expect(documentName([], 'a.md')).toBeNull();
    expect(documentName([{ name: 'origin', url: '/srv/repo.git' }], 'a.md')).toBeNull();
  });

  it('refuses paths that leave the workspace or are absolute', () => {
    expect(documentName(remotes, '../secret.md')).toBeNull();
    expect(documentName(remotes, 'docs/../../x.md')).toBeNull();
    expect(documentName(remotes, '/etc/passwd')).toBeNull();
    expect(documentName(remotes, 'C:/Users/someone/a.md')).toBeNull();
    expect(documentName(remotes, '')).toBeNull();
  });

  it('refuses names over 512 bytes instead of cutting them, so two files never share a name', () => {
    const long = `${'あ'.repeat(200)}.md`;
    expect(documentName(remotes, long)).toBeNull();
  });
});
