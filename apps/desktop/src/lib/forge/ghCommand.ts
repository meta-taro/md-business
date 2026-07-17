/**
 * Governance class for a forge CLI invocation (DESIGN §6.3 / §7.4):
 *   - `read`        — status / list / view. Safe for AI/MCP to run automatically.
 *   - `human-write` — PR/MR creation. Only a human action in the UI may trigger it.
 *
 * `push` and `pr merge` are deliberately absent: the forge adapter must never
 * let AI/MCP auto-push or auto-merge (§6.3 「push/MR-merge を AI 自走させない」,
 * §7.4 push は人間 UI のみ, `git_push` は MCP tool に含めない Issue 004 D-3).
 * There is no builder for them here — omission is the enforcement.
 */
export type ForgePermission = 'read' | 'human-write';

export interface ForgeCommand {
  /** CLI binary. `gh` for GitHub; a `glab` adapter is added in the GitLab phase. */
  bin: 'gh';
  /**
   * argv AFTER the binary, ready to hand to a spawn (argv array — never a shell
   * string). Because every dynamic value is its own array element, titles /
   * bodies containing spaces, quotes, newlines, or `--flag`-looking text can't
   * be re-interpreted as flags or shell commands.
   */
  args: string[];
  /** Governance class — the UI / sidecar gates execution on this (§6.3 / §7.4). */
  permission: ForgePermission;
}

/** `owner/repo` slug (derive from {@link parseForgeRemote}). Optional: gh falls back to CWD. */
interface RepoScope {
  repo?: string;
}

interface ListOptions extends RepoScope {
  state?: 'open' | 'closed' | 'merged' | 'all';
  limit?: number;
}

interface RunListOptions extends RepoScope {
  branch?: string;
  limit?: number;
}

interface PrCreateOptions extends RepoScope {
  base: string;
  head: string;
  title: string;
  body: string;
}

/** Append `--repo owner/repo` when a scope is set. gh reads it as a command flag. */
function withRepo(args: string[], scope: RepoScope): string[] {
  return scope.repo ? [...args, '--repo', scope.repo] : args;
}

function read(args: string[]): ForgeCommand {
  return { bin: 'gh', args, permission: 'read' };
}

export function ghPrStatus(scope: RepoScope): ForgeCommand {
  return read(withRepo(['pr', 'status'], scope));
}

export function ghPrList(options: ListOptions): ForgeCommand {
  const args = ['pr', 'list'];
  if (options.state) {
    args.push('--state', options.state);
  }
  if (options.limit !== undefined) {
    args.push('--limit', String(options.limit));
  }
  return read(withRepo(args, options));
}

export function ghPrView(number: number, scope: RepoScope): ForgeCommand {
  return read(withRepo(['pr', 'view', String(number)], scope));
}

export function ghRunList(options: RunListOptions): ForgeCommand {
  const args = ['run', 'list'];
  if (options.branch) {
    args.push('--branch', options.branch);
  }
  if (options.limit !== undefined) {
    args.push('--limit', String(options.limit));
  }
  return read(withRepo(args, options));
}

export function ghRunView(id: number, scope: RepoScope): ForgeCommand {
  return read(withRepo(['run', 'view', String(id)], scope));
}

export function ghIssueList(options: ListOptions): ForgeCommand {
  const args = ['issue', 'list'];
  if (options.state) {
    args.push('--state', options.state);
  }
  if (options.limit !== undefined) {
    args.push('--limit', String(options.limit));
  }
  return read(withRepo(args, options));
}

/**
 * Build a `gh pr create`. Classified `human-write`: the caller UI must only
 * emit this from an explicit human action, never from an AI/MCP path (§6.3 read
 * vs human-write split, §7.4 governance).
 */
export function ghPrCreate(options: PrCreateOptions): ForgeCommand {
  const args = [
    'pr',
    'create',
    '--base',
    options.base,
    '--head',
    options.head,
    '--title',
    options.title,
    '--body',
    options.body,
  ];
  return { bin: 'gh', args: withRepo(args, options), permission: 'human-write' };
}
