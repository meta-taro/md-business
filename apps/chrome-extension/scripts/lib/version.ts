// Pure SemVer helpers used by the bump-version CLI and unit tests.
// Kept dependency-free so it can be loaded from a plain Node ESM script
// (via dynamic import of the compiled output is overkill here — instead we
// duplicate the tiny logic in bump-version.mjs to keep the CLI runnable
// without a build step). The .ts copy is the canonical version for tests
// so vitest can transform it cleanly without crossing the .mjs boundary.

export type BumpKind = 'patch' | 'minor' | 'major';

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const VALID_KINDS: ReadonlySet<BumpKind> = new Set<BumpKind>(['patch', 'minor', 'major']);

export function parseVersion(version: string): SemVer {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!m) {
    throw new Error(`不正な version 形式: "${version}"（期待: MAJOR.MINOR.PATCH）`);
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function bumpVersion(current: string, kind: string): string {
  if (!VALID_KINDS.has(kind as BumpKind)) {
    throw new Error(`bump kind は patch | minor | major のいずれか（受信: "${kind}"）`);
  }
  const v = parseVersion(current);
  switch (kind as BumpKind) {
    case 'patch':
      return `${v.major}.${v.minor}.${v.patch + 1}`;
    case 'minor':
      return `${v.major}.${v.minor + 1}.0`;
    case 'major':
      return `${v.major + 1}.0.0`;
  }
}
