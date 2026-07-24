#!/usr/bin/env node
/**
 * Block a commit whose staged changes ADD an internal reference.
 *
 * Only added lines are scanned (via `git diff --cached -U0`), so the existing
 * backlog never blocks an unrelated commit — the gate stops *new* leakage from
 * entering the history. Runs in the pre-commit hook.
 *
 * Exit codes: 0 = clean. 1 = internal reference found in staged additions.
 */
import { execFileSync } from 'node:child_process';
import { scanText } from './patterns.mjs';
import { loadAllow, isExcludedPath, formatFindings } from './util.mjs';

function stagedDiff() {
  try {
    return execFileSync('git', ['diff', '--cached', '-U0', '--no-color', '--diff-filter=ACM'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

const allow = loadAllow();
const byFile = new Map();
let file = null;
let excluded = false;
let newLine = 0;

for (const line of stagedDiff().split('\n')) {
  if (line.startsWith('+++ ')) {
    const path = line.slice(4).replace(/^b\//, '').trim();
    file = path === '/dev/null' ? null : path;
    excluded = file ? isExcludedPath(file) : true;
    continue;
  }
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
  if (hunk) {
    newLine = Number(hunk[1]);
    continue;
  }
  if (line.startsWith('+') && !line.startsWith('+++')) {
    if (!excluded && file) {
      for (const f of scanText(line.slice(1), { allow })) {
        if (!byFile.has(file)) byFile.set(file, []);
        byFile.get(file).push({ ...f, line: newLine });
      }
    }
    newLine++;
  }
}

if (byFile.size > 0) {
  console.error('\n✖ [oss-guard] ステージした変更に内部参照が含まれています:');
  console.error(formatFindings(byFile));
  console.error('\n  公開物に内部運用の記述（担当者名・日付帰属・内部ルール参照・内部ハンドル）を');
  console.error('  残さないでください。自己完結した表現へ書き換えてから再度コミットしてください。');
  console.error('  正当な検出は scripts/oss-guard/allowlist.txt で明示的に許可できます。\n');
  process.exit(1);
}
