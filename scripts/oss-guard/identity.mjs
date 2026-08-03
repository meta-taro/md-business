/**
 * Commit-identity hygiene for a public repository.
 *
 * A commit carries two identities — author and committer — and both are
 * published in the history. Unlike a file, they cannot be corrected by a later
 * commit: removing one requires rewriting every descendant commit, which
 * invalidates every hash already referenced elsewhere. So the check belongs
 * *before* the commit exists, not after.
 *
 * The email side is an ALLOWLIST, not a denylist. A denylist would need to
 * enumerate the addresses it forbids — which, in a public repository, means
 * publishing them. Listing the two forms GitHub issues for anonymous commits
 * states the same rule without naming anything private.
 *
 * The name side reuses the internal-reference patterns: a display name is free
 * text and leaks the same way a comment does.
 *
 * Pure module — no I/O. Consumed by `check-identity.mjs`.
 */
import { scanText } from './patterns.mjs';

/**
 * Addresses GitHub issues for commits that must not expose a mailbox:
 * `<id>+<login>@users.noreply.github.com` (current), `<login>@users.noreply.
 * github.com` (issued before per-user IDs), and `noreply@github.com` (the
 * committer on merges made through the web UI). Anchored at both ends so a
 * lookalike domain that merely *contains* one of these cannot pass.
 */
const ALLOWED_EMAIL =
  /^(?:\d+\+)?[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?@users\.noreply\.github\.com$|^noreply@github\.com$/;

/** @param {string} email @returns {boolean} */
export function isAllowedEmail(email) {
  return ALLOWED_EMAIL.test(String(email ?? '').trim());
}

/**
 * Keep only the domain. CI logs are public, so a finding must be able to say
 * *that* an address is wrong without restating it.
 * @param {string} email
 * @returns {string}
 */
function maskEmail(email) {
  const value = String(email ?? '').trim();
  if (value === '') return '(未設定)';
  const at = value.lastIndexOf('@');
  return at < 0 ? '(メール形式ではない値)' : `***@${value.slice(at + 1)}`;
}

/**
 * @typedef {object} Identity
 * @property {string} authorName
 * @property {string} authorEmail
 * @property {string} committerName
 * @property {string} committerEmail
 */

/**
 * @typedef {object} IdentityFinding
 * @property {string} patternId
 * @property {'author'|'committer'} field
 * @property {string} hint
 * @property {string} matched masked — safe to print in a public log
 */

/**
 * Check one commit's (or the pending commit's) identity.
 * @param {Identity} identity
 * @returns {IdentityFinding[]}
 */
export function checkIdentity(identity) {
  const findings = [];

  for (const field of /** @type {const} */ (['author', 'committer'])) {
    const email = identity[`${field}Email`];
    if (!isAllowedEmail(email)) {
      findings.push({
        patternId: 'identity-email',
        field,
        hint: `${field} に GitHub noreply 以外のメール`,
        matched: maskEmail(email),
      });
    }

    for (const f of scanText(String(identity[`${field}Name`] ?? ''))) {
      findings.push({
        patternId: f.patternId,
        field,
        hint: `${field} の表示名: ${f.hint}`,
        matched: f.matched,
      });
    }
  }

  return findings;
}
