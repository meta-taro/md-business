# oss-guard

Keeps internal operating context, and mailboxes, out of published files, commit
messages, and commit identities. Source and history are public, so they should
read as self-contained — explaining *what the code does*, not *who requested it*
or *which private process governs it*.

## What it flags

### In file content and commit messages

`patterns.mjs` is the single source of truth. It detects:

- **author-attribution** — dated authorship notes in comments (git blame
  already records this).
- **internal-role / pdm-term** — private role terms.
- **internal-rule-ref** — pointers into a private rulebook (e.g. `baseline §6`).
  The CSS keyword `baseline` never trips it — a section marker or digit must
  follow.
- **internal-handle** — private repo / assignee handles.

Business-document **sample data** (names inside md/tsv data cells) is out of
scope by design: the patterns target operating references, not document content.

### In commit identity

`identity.mjs` checks the author and committer of a commit:

- **identity-email** — an address that is not one GitHub issues for anonymous
  commits (`<id>+<login>@users.noreply.github.com`, the older
  `<login>@users.noreply.github.com`, or `noreply@github.com` for web-UI merges).
  This is an **allowlist**, not a denylist: a denylist would have to enumerate
  the addresses it forbids, which in a public repository means publishing them.
- The display name is run through the content patterns above — it is free text
  and leaks the same way a comment does.

Findings print the domain only (`***@example.com`); CI logs are public, so the
check must not become the leak. Unlike a file, an identity cannot be corrected
by a later commit — removing one means rewriting every descendant, invalidating
hashes already referenced elsewhere. Hence the check runs *before* the commit
exists.

## How it runs

| Entry point | When | Behavior |
| --- | --- | --- |
| `check-staged.mjs` | pre-commit hook | Scans **added** lines of the staged diff. **Blocks** the commit on any finding, so no new leakage enters history. |
| `check-identity.mjs` | pre-commit hook | Checks the identity git would stamp on the **next** commit. **Blocks** — at this point the fix is a one-line `git config`. |
| `check-msg.mjs` | commit-msg hook | Scans the commit message. **Blocks** on any finding. |
| `check-tree.mjs` | daily CI + push/PR | Scans the whole tracked tree. **Report-only** (exit 0); pass `--strict` to make it blocking once the backlog is zero. |
| `check-identity.mjs --range <range>` | CI, pull requests | Checks every commit a PR adds. **Blocks** the merge. |

The range form takes an explicit range rather than scanning all history: this
repository was public before the check existed, so reachable addresses are
already recorded upstream. Rewriting that history would invalidate every commit
hash referenced from issues and docs, and would not reach clones, forks, or
dangling commits — so the existing history is accepted and the check guards what
is still unpublished.

Commands: `pnpm oss-guard` (report), `pnpm oss-guard:strict` (fail on findings),
`pnpm oss-guard:identity` (check the pending commit's identity),
`pnpm test:oss-guard` (unit tests).

## Waiving a legitimate match

Add the exact matched substring — or the whole trimmed line — to
`allowlist.txt`, with a comment explaining why. For machine-local waivers that
should not be committed, create `allowlist.local.txt` (gitignored).

The scanner's own directory is never scanned, since it lists the denylisted
terms literally.
