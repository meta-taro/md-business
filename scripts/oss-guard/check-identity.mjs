#!/usr/bin/env node
/**
 * Block a commit whose AUTHOR / COMMITTER identity would expose a mailbox.
 *
 * Two modes, for the two moments the check can still be acted on cheaply:
 *
 *   (no args)        Check the identity git is configured to stamp on the NEXT
 *                    commit. Runs in the pre-commit hook — the only point at
 *                    which the fix is a one-line `git config`.
 *   --range <range>  Check every commit in a rev-range (e.g. `origin/main..HEAD`).
 *                    Runs in CI on pull requests.
 *
 * Why the range is required rather than defaulting to the whole history: this
 * repository was public for its first months with reachable addresses already
 * recorded, and rewriting that history would invalidate every commit hash
 * referenced from issues and docs. The check therefore guards what is still
 * unpublished, and the existing history is accepted as-is.
 *
 * Exit codes: 0 = clean. 1 = finding. 2 = usage error.
 */
import { execFileSync } from 'node:child_process';
import { checkIdentity } from './identity.mjs';

/** @param {string[]} args @returns {string|null} */
function readRange(args) {
  const i = args.indexOf('--range');
  if (i < 0) return null;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) {
    console.error('[oss-guard] --range にリビジョン範囲を渡してください（例: origin/main..HEAD）。');
    process.exit(2);
  }
  return value;
}

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}

/** The identity the next commit would be stamped with. */
function pendingIdentity() {
  // `git var` resolves the same precedence git itself uses (env > local >
  // global), and formats as `Name <email> <timestamp> <tz>`.
  const parse = (value) => {
    const m = /^(.*?)\s*<([^>]*)>/.exec(value);
    return { name: m?.[1] ?? '', email: m?.[2] ?? '' };
  };
  let author, committer;
  try {
    author = parse(git(['var', 'GIT_AUTHOR_IDENT']));
    committer = parse(git(['var', 'GIT_COMMITTER_IDENT']));
  } catch {
    console.error('[oss-guard] git の author/committer 情報を取得できませんでした。');
    process.exit(2);
  }
  return [
    {
      label: '(次のコミット)',
      identity: {
        authorName: author.name,
        authorEmail: author.email,
        committerName: committer.name,
        committerEmail: committer.email,
      },
    },
  ];
}

/** Every commit in `range`, oldest first. */
function rangeIdentities(range) {
  // Unit-separator delimited so a display name containing any printable
  // character cannot split the record.
  const out = git(['log', '--reverse', '--format=%h%x1f%an%x1f%ae%x1f%cn%x1f%ce', range]);
  if (out === '') return [];
  return out.split(/\r?\n/).map((line) => {
    const [hash, authorName, authorEmail, committerName, committerEmail] = line.split('\x1f');
    return {
      label: hash,
      identity: { authorName, authorEmail, committerName, committerEmail },
    };
  });
}

const args = process.argv.slice(2);
const range = readRange(args);
const targets = range === null ? pendingIdentity() : rangeIdentities(range);

const failures = targets
  .map((t) => ({ label: t.label, findings: checkIdentity(t.identity) }))
  .filter((t) => t.findings.length > 0);

if (failures.length === 0) {
  const scope = range === null ? '次のコミットの identity' : `${targets.length} コミット`;
  console.log(`✔ [oss-guard] identity は公開に適した設定です（${scope} を確認）。`);
  process.exit(0);
}

const total = failures.reduce((n, f) => n + f.findings.length, 0);
console.error(`\n✖ [oss-guard] コミット identity に公開できない値があります（${total} 件）:`);
for (const { label, findings } of failures) {
  console.error(`\n  ${label}`);
  for (const f of findings) console.error(`    [${f.patternId}] ${f.hint} — 「${f.matched}」`);
}
console.error(
  '\n  このリポジトリだけ noreply に固定してください（--global は付けない）:\n' +
    '    git config user.email "<id>+<login>@users.noreply.github.com"\n' +
    '    git config user.name  "<login>"\n' +
    '  既に作ってしまったコミットは push 前なら `git commit --amend --reset-author` で直せます。\n'
);
process.exit(1);
