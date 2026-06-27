import { describe, expect, it } from 'vitest';

import {
  parseRepoRef,
  parseRepositoryField,
  maskPat,
  buildContentsUrl,
  buildContentsPutPayload,
  extractRepoRefFromSpec,
  buildAutoCommitMessage,
  type RepoRef,
} from '../src/lib/githubApi.js';
import type { TestSpec } from '@md-business/schema-test-spec';

function buildSpec(overrides: Partial<TestSpec> = {}): TestSpec {
  return {
    schema: 'test-spec/v1',
    documentNumber: 'TEST-2026-001',
    title: 'ログイン機能 検証シート',
    version: '0.1.0',
    issueDate: '2026-06-18',
    status: 'draft',
    authors: [{ name: '田中' }],
    columns: [{ name: '項目', type: 'text' }],
    ...overrides,
  };
}

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

describe('extractRepoRefFromSpec', () => {
  it('returns parsed ref when spec.repository is set and valid', () => {
    const spec = buildSpec({ repository: 'meta-taro/md-business@main:verify/login.md' });
    expect(extractRepoRefFromSpec(spec)).toEqual<RepoRef>({
      owner: 'meta-taro',
      repo: 'md-business',
      branch: 'main',
      path: 'verify/login.md',
    });
  });

  it('returns null when spec.repository is omitted', () => {
    const spec = buildSpec();
    expect(extractRepoRefFromSpec(spec)).toBeNull();
  });

  it('returns null when spec.repository is malformed', () => {
    const spec = buildSpec({ repository: 'no-slash@main:x.md' });
    expect(extractRepoRefFromSpec(spec)).toBeNull();
  });

  it('defaults branch to main when @branch is omitted', () => {
    const spec = buildSpec({ repository: 'o/r:verify.md' });
    expect(extractRepoRefFromSpec(spec)?.branch).toBe('main');
  });
});

describe('parseRepositoryField', () => {
  it('extracts and parses repository from valid frontmatter', () => {
    const src = `---
schema: test-spec/v1
repository: meta-taro/md-business@main:docs/verify.md
---

# Body
`;
    expect(parseRepositoryField(src)).toEqual<RepoRef>({
      owner: 'meta-taro',
      repo: 'md-business',
      branch: 'main',
      path: 'docs/verify.md',
    });
  });

  it('returns null when frontmatter is absent', () => {
    expect(parseRepositoryField('# just body')).toBeNull();
  });

  it('returns null when repository key is absent in frontmatter', () => {
    const src = `---
schema: test-spec/v1
---
body`;
    expect(parseRepositoryField(src)).toBeNull();
  });

  it('returns null when repository value is empty', () => {
    const src = `---
schema: test-spec/v1
repository:
---`;
    expect(parseRepositoryField(src)).toBeNull();
  });

  it('returns null when repository value is malformed (parseRepoRef rejects)', () => {
    const src = `---
repository: not-a-valid-ref
---`;
    expect(parseRepositoryField(src)).toBeNull();
  });

  it('handles double-quoted string values', () => {
    const src = `---
repository: "meta-taro/md-business@main:x.md"
---`;
    expect(parseRepositoryField(src)?.owner).toBe('meta-taro');
  });

  it('handles single-quoted string values', () => {
    const src = `---
repository: 'meta-taro/md-business@main:x.md'
---`;
    expect(parseRepositoryField(src)?.owner).toBe('meta-taro');
  });

  it('ignores repository: text in body outside frontmatter', () => {
    const src = `# Title

repository: o/r@main:x.md
`;
    expect(parseRepositoryField(src)).toBeNull();
  });

  it('returns null when frontmatter YAML is malformed', () => {
    const src = `---
repository: o/r@main:x.md
  bad indent: [
---`;
    expect(parseRepositoryField(src)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseRepositoryField('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseRepositoryField(null as unknown as string)).toBeNull();
    expect(parseRepositoryField(undefined as unknown as string)).toBeNull();
  });
});

describe('maskPat', () => {
  it('masks a typical ghp_ token preserving 4 head + 4 tail chars', () => {
    expect(maskPat('ghp_abcd12345xyz6789')).toBe('ghp_…••6789');
  });

  it('masks fine-grained github_pat_ tokens', () => {
    const pat = 'github_pat_11ABCDEFG0somerandompayloadXYZ';
    const result = maskPat(pat);
    expect(result?.startsWith('gith')).toBe(true);
    expect(result?.endsWith('dXYZ')).toBe(true);
    expect(result).toContain('…••');
  });

  it('returns ••••• for short strings (under threshold) to avoid leaking secret', () => {
    expect(maskPat('short')).toBe('••••');
    expect(maskPat('abcdefghijk')).toBe('••••'); // 11 chars < 12
  });

  it('returns null for empty / null / undefined', () => {
    expect(maskPat('')).toBeNull();
    expect(maskPat(null)).toBeNull();
    expect(maskPat(undefined)).toBeNull();
  });

  it('does not include the middle bytes of the secret', () => {
    const secret = 'ghp_SECRETmiddleVISIBLE9999';
    const masked = maskPat(secret);
    expect(masked).not.toContain('SECRETmiddleVISIBLE');
  });
});

describe('buildAutoCommitMessage', () => {
  it('builds default message with documentNumber, sheetName, timestamp', () => {
    const spec = buildSpec();
    expect(
      buildAutoCommitMessage({
        spec,
        sheetName: 'Sheet1',
        isoTimestamp: '2026-06-18T09:30:00Z',
      }),
    ).toBe(
      'chore(test-spec): sync TEST-2026-001 from "Sheet1" — 2026-06-18T09:30:00Z',
    );
  });

  it('uses customMessage verbatim when provided', () => {
    const spec = buildSpec();
    expect(
      buildAutoCommitMessage({
        spec,
        sheetName: 'Sheet1',
        isoTimestamp: '2026-06-18T09:30:00Z',
        customMessage: 'fix: typo in row 3',
      }),
    ).toBe('fix: typo in row 3');
  });

  it('strips ASCII double quotes in sheetName to avoid breaking the format', () => {
    const spec = buildSpec();
    const msg = buildAutoCommitMessage({
      spec,
      sheetName: 'Sheet "with quote"',
      isoTimestamp: '2026-06-18T09:30:00Z',
    });
    expect(msg).toBe(
      'chore(test-spec): sync TEST-2026-001 from "Sheet with quote" — 2026-06-18T09:30:00Z',
    );
  });
});
