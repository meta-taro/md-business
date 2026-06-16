import { describe, it, expect } from 'vitest';
import { bumpVersion, parseVersion } from '../scripts/lib/version';

describe('parseVersion', () => {
  it('parses standard semver triple', () => {
    expect(parseVersion('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 });
    expect(parseVersion('12.34.56')).toEqual({ major: 12, minor: 34, patch: 56 });
  });

  it('rejects pre-release suffix', () => {
    expect(() => parseVersion('0.1.0-beta.1')).toThrow();
  });

  it('rejects 4-part version', () => {
    expect(() => parseVersion('1.2.3.4')).toThrow();
  });

  it('rejects empty/garbage', () => {
    expect(() => parseVersion('')).toThrow();
    expect(() => parseVersion('latest')).toThrow();
  });
});

describe('bumpVersion', () => {
  it('patch bumps the patch component only', () => {
    expect(bumpVersion('0.1.0', 'patch')).toBe('0.1.1');
    expect(bumpVersion('1.2.20', 'patch')).toBe('1.2.21');
    expect(bumpVersion('0.0.0', 'patch')).toBe('0.0.1');
  });

  it('minor bumps the minor and resets patch', () => {
    expect(bumpVersion('0.1.0', 'minor')).toBe('0.2.0');
    expect(bumpVersion('0.1.5', 'minor')).toBe('0.2.0');
    expect(bumpVersion('2.9.7', 'minor')).toBe('2.10.0');
  });

  it('major bumps the major and resets minor/patch', () => {
    expect(bumpVersion('0.5.3', 'major')).toBe('1.0.0');
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('rejects unknown bump kind', () => {
    expect(() => bumpVersion('0.1.0', 'foo')).toThrow();
  });

  it('rejects malformed current version', () => {
    expect(() => bumpVersion('0.1', 'patch')).toThrow();
    expect(() => bumpVersion('v0.1.0', 'patch')).toThrow();
  });
});
