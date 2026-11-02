import { describe, expect, it } from 'vitest';
import { fileKind } from '../src/kind.js';

describe('fileKind', () => {
  it.each([
    ['docs/spec.md', 'markdown'],
    ['README.MARKDOWN', 'markdown'],
    ['docs/test-specs/001-login.tsv', 'tsv'],
    ['img/a.PNG', 'image'],
    ['img/a.svg', 'image'],
    ['img/a.webp', 'image'],
    ['図/本番構成.zumen.yaml', 'zumen'],
    ['図/本番構成.ZUMEN.YML', 'zumen'],
    ['C:\\work\\図\\a.zumen.yaml', 'zumen'],
    ['config.yaml', 'yaml'],
    ['data.json', 'other'],
    ['Makefile', 'other'],
    ['dir.md/Makefile', 'other'],
    ['.zumen.yaml', 'yaml'],
  ] as const)('%s → %s', (path, kind) => {
    expect(fileKind(path)).toBe(kind);
  });
});
