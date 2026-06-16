#!/usr/bin/env node
// Bump version of apps/chrome-extension/package.json AND public/manifest.json
// in lockstep. Chrome Web Store enforces strict version monotonicity per
// upload, so any zip re-submission must carry a strictly greater version.
// Run via: pnpm release:patch | release:minor | release:major
//   patch → 0.1.0 → 0.1.1
//   minor → 0.1.4 → 0.2.0
//   major → 0.2.7 → 1.0.0
// Reads version from manifest.json (source of truth), updates both files.
//
// Note: parseVersion/bumpVersion below are intentionally duplicated from
// scripts/lib/version.ts. The .ts copy is unit-tested by vitest (which can
// transform .ts directly but trips on .mjs imports through its esbuild
// pipeline), while this .mjs copy lets `node scripts/bump-version.mjs` run
// without any transpiler step. Keep the two implementations in sync.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PKG_PATH = resolve(ROOT, 'package.json');
const MANIFEST_PATH = resolve(ROOT, 'public', 'manifest.json');

const VALID_KINDS = new Set(['patch', 'minor', 'major']);

/**
 * Parse a strict SemVer triple. Rejects pre-release / build suffixes — the
 * Chrome Web Store manifest version field only allows up to 4 dot-separated
 * integers, so we conservatively require exactly `MAJOR.MINOR.PATCH`.
 */
export function parseVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!m) throw new Error(`不正な version 形式: "${version}"（期待: MAJOR.MINOR.PATCH）`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function bumpVersion(current, kind) {
  if (!VALID_KINDS.has(kind)) {
    throw new Error(`bump kind は patch | minor | major のいずれか（受信: "${kind}"）`);
  }
  const v = parseVersion(current);
  switch (kind) {
    case 'patch':
      return `${v.major}.${v.minor}.${v.patch + 1}`;
    case 'minor':
      return `${v.major}.${v.minor + 1}.0`;
    case 'major':
      return `${v.major + 1}.0.0`;
    default:
      throw new Error(`unreachable: ${kind}`);
  }
}

async function readJson(path) {
  const text = await readFile(path, 'utf8');
  return { text, json: JSON.parse(text) };
}

/**
 * Replace exactly the value of the top-level `"version": "..."` line so we
 * preserve key ordering, comments-as-keys, and trailing newline that
 * JSON.stringify would otherwise normalize away. Falls back to a structural
 * rewrite if no match (e.g. unusual formatting), with a stable 2-space indent.
 */
function replaceVersionInJsonText(text, nextVersion) {
  const re = /(^\s*"version"\s*:\s*")[^"]*(")/m;
  if (re.test(text)) return text.replace(re, `$1${nextVersion}$2`);
  const obj = JSON.parse(text);
  obj.version = nextVersion;
  return JSON.stringify(obj, null, 2) + '\n';
}

async function main() {
  const kind = process.argv[2];
  if (!kind) {
    console.error('Usage: node bump-version.mjs <patch|minor|major>');
    process.exit(1);
  }

  const pkg = await readJson(PKG_PATH);
  const manifest = await readJson(MANIFEST_PATH);

  // Source of truth: manifest.json — this is the version Chrome Web Store
  // reads on upload, and the value that must strictly increase per submission.
  // package.json is workspace-private (`private: true`) and follows manifest.
  const current = manifest.json.version;
  const pkgCurrent = pkg.json.version;
  if (current !== pkgCurrent) {
    console.warn(
      `[bump-version] WARNING: manifest.json (${current}) と package.json (${pkgCurrent}) がドリフトしています。manifest.json を source of truth として採用し、package.json も揃えます。`,
    );
  }

  const next = bumpVersion(current, kind);

  await writeFile(PKG_PATH, replaceVersionInJsonText(pkg.text, next), 'utf8');
  await writeFile(MANIFEST_PATH, replaceVersionInJsonText(manifest.text, next), 'utf8');

  console.log(`[bump-version] ${current} → ${next} (${kind})`);
  console.log('[bump-version] updated:');
  console.log(`  - ${PKG_PATH}`);
  console.log(`  - ${MANIFEST_PATH}`);
}

// Run only when invoked as a script — `import`'ing for tests is a no-op.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[bump-version] error: ${err.message ?? err}`);
    process.exit(1);
  });
}
