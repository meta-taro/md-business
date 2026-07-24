#!/usr/bin/env node
/**
 * Scan the whole tracked tree for internal references. Runs daily in CI and on
 * push/PR as a standing report of the backlog.
 *
 * Report-only by default (exit 0) so the existing backlog does not turn CI red
 * while it is being worked down. Pass `--strict` to exit non-zero on any
 * finding — flip the CI job to strict once the backlog reaches zero.
 *
 * Exit codes: 0 = clean, or findings in report mode. 1 = findings in --strict.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanText } from './patterns.mjs';
import { loadAllow, isExcludedPath, looksTextual, formatFindings, REPO_ROOT } from './util.mjs';

const strict = process.argv.includes('--strict');
const allow = loadAllow();

const tracked = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .split('\0')
  .filter(Boolean);

const byFile = new Map();
let scanned = 0;

for (const rel of tracked) {
  if (isExcludedPath(rel)) continue;
  let buf;
  try {
    buf = readFileSync(resolve(REPO_ROOT, rel));
  } catch {
    continue;
  }
  if (buf.length > 1024 * 1024 || !looksTextual(buf)) continue;
  scanned++;
  const findings = scanText(buf.toString('utf8'), { allow });
  if (findings.length > 0) byFile.set(rel, findings);
}

const total = [...byFile.values()].reduce((n, f) => n + f.length, 0);

if (total === 0) {
  console.log(`✔ [oss-guard] 内部参照は検出されませんでした（${scanned} ファイル走査）。`);
  process.exit(0);
}

const stream = strict ? console.error : console.log;
const mark = strict ? '✖' : '⚠';
stream(`${mark} [oss-guard] 内部参照 ${total} 件 / ${byFile.size} ファイル（${scanned} ファイル走査）:`);
stream(formatFindings(byFile));
stream(
  strict
    ? '\n  公開物に内部運用の記述を残さないでください。上記を解消してください。'
    : '\n  上記は公開物の内部参照です（レポートのみ・非ブロック）。順次解消してください。'
);

process.exit(strict ? 1 : 0);
