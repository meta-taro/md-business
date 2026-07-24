# oss-guard

Keeps internal operating context out of published files and commit messages.
Source and commit history are public, so they should read as self-contained —
explaining *what the code does*, not *who requested it* or *which private
process governs it*.

## What it flags

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

## How it runs

| Entry point | When | Behavior |
| --- | --- | --- |
| `check-staged.mjs` | pre-commit hook | Scans **added** lines of the staged diff. **Blocks** the commit on any finding, so no new leakage enters history. |
| `check-msg.mjs` | commit-msg hook | Scans the commit message. **Blocks** on any finding. |
| `check-tree.mjs` | daily CI + push/PR | Scans the whole tracked tree. **Report-only** (exit 0); pass `--strict` to make it blocking once the backlog is zero. |

Commands: `pnpm oss-guard` (report), `pnpm oss-guard:strict` (fail on findings),
`pnpm test:oss-guard` (unit tests).

## Waiving a legitimate match

Add the exact matched substring — or the whole trimmed line — to
`allowlist.txt`, with a comment explaining why. For machine-local waivers that
should not be committed, create `allowlist.local.txt` (gitignored).

The scanner's own directory is never scanned, since it lists the denylisted
terms literally.
