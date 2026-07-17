/**
 * Forge kind detected from a Git remote URL. `unknown` covers self-hosted
 * hosts whose forge software can't be inferred from the URL alone (DESIGN §6.3:
 * remote-URL auto-detect, forge kind shown in the status bar).
 */
export type ForgeKind = 'github' | 'gitlab' | 'unknown';

export interface ForgeRemote {
  forge: ForgeKind;
  /** Bare hostname, e.g. `github.com`, `gitlab.acme-corp.com`. */
  host: string;
  /** Repo owner. Keeps the full path for GitLab nested groups (`group/subgroup`). */
  owner: string;
  /** Repo name without the `.git` suffix. */
  repo: string;
}

/**
 * Parse a Git remote URL into `{ forge, host, owner, repo }` — the read-only
 * half of the forge abstraction (DESIGN §6.3). Pure and side-effect free so it
 * can drive the status-bar forge badge and the gh/glab adapter selection.
 *
 * Handles the three shapes `git remote get-url origin` can emit:
 *   - scp-like SSH:   `git@github.com:owner/repo.git`
 *   - `ssh://` URL:   `ssh://git@github.com/owner/repo.git`
 *   - HTTP(S) URL:    `https://github.com/owner/repo(.git)`
 *
 * Returns `null` when the input isn't a recognizable remote or lacks a
 * `owner/repo` path (a single path segment can't be split into owner + repo).
 */
export function parseForgeRemote(remoteUrl: string): ForgeRemote | null {
  const trimmed = remoteUrl.trim();
  if (trimmed === '') {
    return null;
  }

  const hostPath = extractHostAndPath(trimmed);
  if (hostPath === null) {
    return null;
  }
  const { host, path } = hostPath;

  const segments = normalizePath(path);
  if (segments.length < 2) {
    // Need at least `owner/repo`; a lone segment is not addressable.
    return null;
  }

  const repo = segments[segments.length - 1];
  const owner = segments.slice(0, -1).join('/');
  if (host === '' || owner === '' || repo === '') {
    return null;
  }

  return { forge: detectForge(host), host, owner, repo };
}

/**
 * Split a remote URL into its host and repo-path. `null` when the string isn't
 * one of the recognized remote shapes.
 */
function extractHostAndPath(url: string): { host: string; path: string } | null {
  // scheme:// forms (https, http, ssh, git). Parse via WHATWG URL; it exposes
  // hostname + pathname uniformly and strips any `user@` / `:port`.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return { host: parsed.hostname, path: parsed.pathname };
    } catch {
      return null;
    }
  }

  // scp-like SSH: `[user@]host:path`. The colon separates host from path and
  // (unlike a scheme) is not followed by `//`.
  const scp = /^(?:[^@/]+@)?([^/:]+):(.+)$/.exec(url);
  if (scp !== null) {
    return { host: scp[1], path: scp[2] };
  }

  return null;
}

/** Strip leading/trailing slashes and a trailing `.git`, then split on `/`. */
function normalizePath(path: string): string[] {
  const cleaned = path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  if (cleaned === '') {
    return [];
  }
  return cleaned.split('/').filter((s) => s !== '');
}

function detectForge(host: string): ForgeKind {
  const lower = host.toLowerCase();
  if (lower.includes('github')) {
    return 'github';
  }
  if (lower.includes('gitlab')) {
    return 'gitlab';
  }
  return 'unknown';
}
