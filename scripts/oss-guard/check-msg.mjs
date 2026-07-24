#!/usr/bin/env node
/**
 * Block a commit whose MESSAGE contains an internal reference. Runs in the
 * commit-msg hook, which passes the message file path as the first argument.
 *
 * Commit messages are published in the history and in GitHub's UI, so the same
 * hygiene applies to them as to source: no author-attributed dated notes, no
 * internal role/handle terms, no private rule-section pointers.
 *
 * Exit codes: 0 = clean. 1 = internal reference found. 2 = no message file.
 */
import { readFileSync } from 'node:fs';
import { scanText } from './patterns.mjs';
import { loadAllow, formatFindings } from './util.mjs';

const msgPath = process.argv[2];
if (!msgPath) {
  console.error('[oss-guard] コミットメッセージのファイルパスが渡されていません。');
  process.exit(2);
}

// Drop git's comment lines and the diff after a `# ------- >8 -------` scissor,
// which are not part of the recorded message.
const raw = readFileSync(msgPath, 'utf8');
const body = raw
  .split(/\r?\n/)
  .filter((l) => !l.startsWith('#'))
  .join('\n');

const findings = scanText(body, { allow: loadAllow() });
if (findings.length > 0) {
  const byFile = new Map([['(commit message)', findings]]);
  console.error('\n✖ [oss-guard] コミットメッセージに内部参照が含まれています:');
  console.error(formatFindings(byFile));
  console.error('\n  メッセージから内部運用の記述を除き、自己完結した表現へ直してください。\n');
  process.exit(1);
}
