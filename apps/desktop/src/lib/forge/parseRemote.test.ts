import { describe, it, expect } from 'vitest';
import { parseForgeRemote } from './parseRemote';

describe('parseForgeRemote', () => {
  describe('GitHub', () => {
    it('parses an SSH (scp-like) github.com remote', () => {
      expect(parseForgeRemote('git@github.com:meta-taro/md-business.git')).toEqual({
        forge: 'github',
        host: 'github.com',
        owner: 'meta-taro',
        repo: 'md-business',
      });
    });

    it('parses an HTTPS github.com remote with .git suffix', () => {
      expect(parseForgeRemote('https://github.com/meta-taro/md-business.git')).toEqual({
        forge: 'github',
        host: 'github.com',
        owner: 'meta-taro',
        repo: 'md-business',
      });
    });

    it('parses an HTTPS github.com remote without .git suffix', () => {
      expect(parseForgeRemote('https://github.com/meta-taro/md-business')).toEqual({
        forge: 'github',
        host: 'github.com',
        owner: 'meta-taro',
        repo: 'md-business',
      });
    });

    it('parses an ssh:// protocol github.com remote', () => {
      expect(parseForgeRemote('ssh://git@github.com/meta-taro/md-business.git')).toEqual({
        forge: 'github',
        host: 'github.com',
        owner: 'meta-taro',
        repo: 'md-business',
      });
    });

    it('detects GitHub Enterprise (self-hosted) by host substring', () => {
      expect(parseForgeRemote('git@github.acme-corp.com:team/app.git')).toEqual({
        forge: 'github',
        host: 'github.acme-corp.com',
        owner: 'team',
        repo: 'app',
      });
    });
  });

  describe('GitLab', () => {
    it('parses an SSH gitlab.com remote', () => {
      expect(parseForgeRemote('git@gitlab.com:group/project.git')).toEqual({
        forge: 'gitlab',
        host: 'gitlab.com',
        owner: 'group',
        repo: 'project',
      });
    });

    it('parses an HTTPS gitlab.com remote', () => {
      expect(parseForgeRemote('https://gitlab.com/group/project.git')).toEqual({
        forge: 'gitlab',
        host: 'gitlab.com',
        owner: 'group',
        repo: 'project',
      });
    });

    it('keeps subgroup path in owner (gitlab nested groups)', () => {
      expect(parseForgeRemote('https://gitlab.com/group/subgroup/project.git')).toEqual({
        forge: 'gitlab',
        host: 'gitlab.com',
        owner: 'group/subgroup',
        repo: 'project',
      });
    });

    it('detects self-hosted GitLab by host substring', () => {
      expect(parseForgeRemote('git@gitlab.acme-corp.com:team/app.git')).toEqual({
        forge: 'gitlab',
        host: 'gitlab.acme-corp.com',
        owner: 'team',
        repo: 'app',
      });
    });
  });

  describe('unknown / self-hosted forge', () => {
    it('reports forge=unknown for a host with no github/gitlab marker', () => {
      expect(parseForgeRemote('https://git.example.com/owner/repo.git')).toEqual({
        forge: 'unknown',
        host: 'git.example.com',
        owner: 'owner',
        repo: 'repo',
      });
    });
  });

  describe('edge cases', () => {
    it('strips a trailing slash before parsing', () => {
      expect(parseForgeRemote('https://github.com/meta-taro/md-business/')).toEqual({
        forge: 'github',
        host: 'github.com',
        owner: 'meta-taro',
        repo: 'md-business',
      });
    });

    it('trims surrounding whitespace', () => {
      expect(parseForgeRemote('  git@github.com:meta-taro/md-business.git  ')).toEqual({
        forge: 'github',
        host: 'github.com',
        owner: 'meta-taro',
        repo: 'md-business',
      });
    });

    it('returns null for an empty string', () => {
      expect(parseForgeRemote('')).toBeNull();
    });

    it('returns null when owner/repo cannot be determined (single path segment)', () => {
      expect(parseForgeRemote('https://github.com/onlyrepo')).toBeNull();
    });

    it('returns null for a non-remote string', () => {
      expect(parseForgeRemote('not a url')).toBeNull();
    });
  });
});
