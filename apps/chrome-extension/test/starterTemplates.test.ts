import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadMarkdown } from '../src/shared/loadMarkdown.js';

// ポップアップの「サンプルから作成」に並べるもの。開いた瞬間にエラーで止まらないこと。
const STARTERS: Array<[string, string, string]> = [
  ['spec', 'standard-ja.md', 'spec'],
  ['test-spec', 'standard-ja.tsv', 'test-spec-tsv'],
  ['test-spec', 'standard-ja.md', 'test-spec'],
  ['api-spec', 'standard-ja.md', 'api-spec'],
  ['investigation', 'standard-ja.md', 'investigation'],
];

describe('starter templates', () => {
  it.each(STARTERS)('templates/%s/%s loads as %s', (dir, file, pluginId) => {
    const md = readFileSync(resolve(__dirname, '..', '..', '..', 'templates', dir, file), 'utf8');
    const result = loadMarkdown(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pluginId).toBe(pluginId);
  });
});
