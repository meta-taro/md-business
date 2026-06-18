import { describe, expect, it } from 'vitest';

import {
  parseRepoRef,
  buildContentsUrl,
  buildContentsPutPayload,
  type RepoRef,
} from '../src/lib/githubApi.js';

describe('parseRepoRef', () => {
  it('parses owner/repo@branch:path form', () => {
    const ref = parseRepoRef('meta-taro/md-business@main:verification/login.md');
    expect(ref).toEqual<RepoRef>({
      owner: 'meta-taro',
      repo: 'md-business',
      branch: 'main',
      path: 'verification/login.md',
    });
  });

  it('defaults branch to "main" when @branch is omitted', () => {
    const ref = parseRepoRef('meta-taro/md-business:verification/login.md');
    expect(ref?.branch).toBe('main');
    expect(ref?.path).toBe('verification/login.md');
  });

  it('supports nested paths with slashes', () => {
    const ref = parseRepoRef('o/r@main:a/b/c/d.md');
    expect(ref?.path).toBe('a/b/c/d.md');
  });

  it('supports branches that contain slashes (e.g. feat/foo)', () => {
    const ref = parseRepoRef('o/r@feat/test-spec:verify.md');
    expect(ref?.branch).toBe('feat/test-spec');
    expect(ref?.path).toBe('verify.md');
  });

  it('returns null for refs missing path', () => {
    expect(parseRepoRef('meta-taro/md-business@main')).toBeNull();
    expect(parseRepoRef('meta-taro/md-business@main:')).toBeNull();
  });

  it('returns null for refs missing owner or repo', () => {
    expect(parseRepoRef('@main:x.md')).toBeNull();
    expect(parseRepoRef('owneronly@main:x.md')).toBeNull();
    expect(parseRepoRef('')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    const ref = parseRepoRef('  meta-taro/md-business@main:x.md  ');
    expect(ref?.owner).toBe('meta-taro');
  });
});

describe('buildContentsUrl', () => {
  it('returns the GitHub Contents API URL with ref query', () => {
    expect(
      buildContentsUrl({
        owner: 'meta-taro',
        repo: 'md-business',
        branch: 'main',
        path: 'verification/login.md',
      }),
    ).toBe(
      'https://api.github.com/repos/meta-taro/md-business/contents/verification/login.md?ref=main',
    );
  });

  it('encodes the path segment but keeps slashes intact', () => {
    expect(
      buildContentsUrl({
        owner: 'o',
        repo: 'r',
        branch: 'main',
        path: 'dir with space/ファイル名.md',
      }),
    ).toBe(
      'https://api.github.com/repos/o/r/contents/dir%20with%20space/%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB%E5%90%8D.md?ref=main',
    );
  });

  it('encodes branch names containing slashes for the ref query', () => {
    const url = buildContentsUrl({
      owner: 'o',
      repo: 'r',
      branch: 'feat/foo bar',
      path: 'x.md',
    });
    expect(url).toContain('?ref=feat%2Ffoo%20bar');
  });
});

describe('buildContentsPutPayload', () => {
  it('includes message / content / branch when sha is omitted (new file)', () => {
    const payload = buildContentsPutPayload({
      message: 'sync verification sheet',
      contentBase64: 'IyBoZWxsbw==',
      branch: 'main',
    });
    expect(payload).toEqual({
      message: 'sync verification sheet',
      content: 'IyBoZWxsbw==',
      branch: 'main',
    });
  });

  it('includes sha when updating an existing file', () => {
    const payload = buildContentsPutPayload({
      message: 'update',
      contentBase64: 'YWFh',
      branch: 'main',
      sha: 'deadbeef',
    });
    expect(payload.sha).toBe('deadbeef');
    expect(payload.content).toBe('YWFh');
  });

  it('omits sha key entirely when sha is undefined', () => {
    const payload = buildContentsPutPayload({
      message: 'm',
      contentBase64: 'YQ==',
      branch: 'main',
    });
    expect(Object.prototype.hasOwnProperty.call(payload, 'sha')).toBe(false);
  });

  it('preserves committer when provided', () => {
    const payload = buildContentsPutPayload({
      message: 'm',
      contentBase64: 'YQ==',
      branch: 'main',
      committer: { name: 'md-business bot', email: 'noreply@example.com' },
    });
    expect(payload.committer).toEqual({
      name: 'md-business bot',
      email: 'noreply@example.com',
    });
  });
});
