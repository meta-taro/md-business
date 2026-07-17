import { describe, it, expect } from 'vitest';
import {
  ghPrStatus,
  ghPrList,
  ghPrView,
  ghRunList,
  ghRunView,
  ghIssueList,
  ghPrCreate,
  type ForgeCommand,
} from './ghCommand';

describe('gh command builders', () => {
  describe('read commands (AI-auto OK・§6.3)', () => {
    it('builds `gh pr status`', () => {
      const cmd = ghPrStatus({ repo: 'meta-taro/md-business' });
      expect(cmd).toEqual<ForgeCommand>({
        bin: 'gh',
        args: ['pr', 'status', '--repo', 'meta-taro/md-business'],
        permission: 'read',
      });
    });

    it('omits --repo when no repo is given', () => {
      expect(ghPrStatus({}).args).toEqual(['pr', 'status']);
    });

    it('builds `gh pr list` with state and limit', () => {
      const cmd = ghPrList({ repo: 'meta-taro/md-business', state: 'open', limit: 20 });
      expect(cmd.args).toEqual([
        'pr',
        'list',
        '--state',
        'open',
        '--limit',
        '20',
        '--repo',
        'meta-taro/md-business',
      ]);
      expect(cmd.permission).toBe('read');
    });

    it('builds `gh pr view <number>`', () => {
      expect(ghPrView(74, { repo: 'meta-taro/md-business' }).args).toEqual([
        'pr',
        'view',
        '74',
        '--repo',
        'meta-taro/md-business',
      ]);
    });

    it('builds `gh run list` filtered by branch', () => {
      const cmd = ghRunList({ repo: 'meta-taro/md-business', branch: 'main', limit: 5 });
      expect(cmd.args).toEqual([
        'run',
        'list',
        '--branch',
        'main',
        '--limit',
        '5',
        '--repo',
        'meta-taro/md-business',
      ]);
      expect(cmd.permission).toBe('read');
    });

    it('builds `gh run view <id>`', () => {
      expect(ghRunView(29563510898, {}).args).toEqual(['run', 'view', '29563510898']);
    });

    it('builds `gh issue list`', () => {
      const cmd = ghIssueList({ repo: 'meta-taro/md-business', state: 'open', limit: 30 });
      expect(cmd.args).toEqual([
        'issue',
        'list',
        '--state',
        'open',
        '--limit',
        '30',
        '--repo',
        'meta-taro/md-business',
      ]);
      expect(cmd.permission).toBe('read');
    });
  });

  describe('human-triggered write (§6.3 / §7.4)', () => {
    it('builds `gh pr create` classified as human-write', () => {
      const cmd = ghPrCreate({
        repo: 'meta-taro/md-business',
        base: 'main',
        head: 'feat/x',
        title: 'feat: x',
        body: 'body text',
      });
      expect(cmd).toEqual<ForgeCommand>({
        bin: 'gh',
        args: [
          'pr',
          'create',
          '--base',
          'main',
          '--head',
          'feat/x',
          '--title',
          'feat: x',
          '--body',
          'body text',
          '--repo',
          'meta-taro/md-business',
        ],
        permission: 'human-write',
      });
    });

    it('keeps a title with spaces / flag-like text as a single argv element (injection-safe)', () => {
      const cmd = ghPrCreate({
        base: 'main',
        head: 'feat/x',
        title: '--force; rm -rf / && echo pwned',
        body: 'line1\nline2 "quoted"',
      });
      // The dangerous string lands as ONE argv element right after --title, so a
      // spawn (argv array, no shell) can never re-interpret it as flags/commands.
      const titleIdx = cmd.args.indexOf('--title');
      expect(cmd.args[titleIdx + 1]).toBe('--force; rm -rf / && echo pwned');
      const bodyIdx = cmd.args.indexOf('--body');
      expect(cmd.args[bodyIdx + 1]).toBe('line1\nline2 "quoted"');
    });
  });
});
