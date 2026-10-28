import { describe, expect, it } from 'vitest';
import { lineForPath, topLevelKeyLines } from '../src/keyLines.js';

const DOC = [
  '---', // 1
  'schema: spec/v1', // 2
  'title: 基本設計書', // 3
  'items:', // 4
  '  - name: a', // 5
  "'quoted key': 1", // 6
  '# comment: no', // 7
  '---', // 8
  'body: not frontmatter', // 9
].join('\n');

describe('topLevelKeyLines', () => {
  it('maps each top-level key to its 1-based file line', () => {
    const lines = topLevelKeyLines(DOC);
    expect(lines.get('schema')).toBe(2);
    expect(lines.get('title')).toBe(3);
    expect(lines.get('items')).toBe(4);
    expect(lines.get('quoted key')).toBe(6);
  });

  it('ignores nested keys, comments and the body', () => {
    const lines = topLevelKeyLines(DOC);
    expect(lines.has('name')).toBe(false);
    expect(lines.has('# comment')).toBe(false);
    expect(lines.has('body')).toBe(false);
  });

  it('returns an empty map when there is no frontmatter', () => {
    expect(topLevelKeyLines('# 見出し\nschema: x').size).toBe(0);
  });

  it('handles CRLF and an unterminated block', () => {
    const lines = topLevelKeyLines('---\r\nschema: a\r\ntitle: b');
    expect(lines.get('title')).toBe(3);
  });
});

describe('lineForPath', () => {
  it('uses the first path segment', () => {
    expect(lineForPath(DOC, '/items/0/name')).toBe(4);
  });

  it('decodes JSON Pointer escapes', () => {
    const doc = '---\na/b: 1\n---';
    expect(lineForPath(doc, '/a~1b')).toBe(2);
  });

  it('falls back to the schema line, then line 1', () => {
    expect(lineForPath(DOC, '/')).toBe(2);
    expect(lineForPath(DOC, '/missing')).toBe(2);
    expect(lineForPath('---\ntitle: x\n---', '/')).toBe(1);
  });
});
