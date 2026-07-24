/**
 * Shared helpers for the OSS-hygiene scanners: path exclusion, allowlist
 * loading, and finding formatting. Kept dependency-free (Node built-ins only).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');

/** The scanners' own source lists the denylisted terms literally, so it is
 * never scanned; lockfiles are generated. Paths are matched with `includes`
 * against a forward-slash-normalized repo-relative path. */
const EXCLUDED_PREFIXES = ['scripts/oss-guard/'];
const EXCLUDED_FILES = ['pnpm-lock.yaml'];

/** Binary assets carry no reviewable text — skip by extension. */
const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.zip', '.gz', '.wasm', '.mp4', '.mp3', '.mov', '.lock',
]);

/** @param {string} relPath repo-relative path (any separator) */
export function isExcludedPath(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (EXCLUDED_FILES.includes(p)) return true;
  if (EXCLUDED_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  if (BINARY_EXTS.has(extname(p).toLowerCase())) return true;
  return false;
}

/** True if the buffer looks like text (no NUL byte in the first 8 KB). */
export function looksTextual(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  return true;
}

/**
 * Load allowlisted literals from `allowlist.txt` (committed) and an optional
 * `allowlist.local.txt` (gitignored, for machine-local waivers). Blank lines
 * and `#` comments are ignored.
 * @returns {string[]}
 */
export function loadAllow() {
  const out = [];
  for (const name of ['allowlist.txt', 'allowlist.local.txt']) {
    const file = resolve(HERE, name);
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      out.push(line);
    }
  }
  return out;
}

/**
 * Render findings grouped by file to a string. Each finding: the tool prints
 * `path:line:col  [patternId] hint — matched`.
 * @param {Map<string, {patternId:string,hint:string,matched:string,line:number,col:number,text:string}[]>} byFile
 */
export function formatFindings(byFile) {
  const lines = [];
  for (const [file, findings] of byFile) {
    lines.push(`\n  ${file}`);
    for (const f of findings) {
      lines.push(`    ${f.line}:${f.col}  [${f.patternId}] ${f.hint} — 「${f.matched}」`);
    }
  }
  return lines.join('\n');
}
