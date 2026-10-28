import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diagnose } from '../src/diagnostics.js';

const TEMPLATES = resolve(__dirname, '../../../templates');
const template = (path: string): string => readFileSync(resolve(TEMPLATES, path), 'utf8');

describe('diagnose', () => {
  it('reports nothing for plain Markdown', () => {
    expect(diagnose('# 見出し\n\n本文')).toEqual([]);
  });

  it('reports nothing for frontmatter that declares no schema', () => {
    expect(diagnose('---\ntitle: ブログ\n---\n本文')).toEqual([]);
  });

  it.each([
    'invoice/standard-ja.md',
    'spec/standard-ja.md',
    'test-spec/standard-ja.md',
    'api-spec/standard-ja.md',
    'investigation/standard-ja.md',
  ])('reports nothing for the shipped template %s', (path) => {
    expect(diagnose(template(path))).toEqual([]);
  });

  it('warns on the declaration line when the schema is unknown', () => {
    const problems = diagnose('---\ntitle: x\nschema: nope/v9\n---\n');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ line: 3, severity: 'warning' });
    expect(problems[0]?.message).toContain('nope/v9');
  });

  it('stays silent on broken YAML when no schema is declared', () => {
    expect(diagnose('---\ntitle: x\n\tdate: y\n---\n')).toEqual([]);
  });

  it('places a YAML error on the line the parser stopped at', () => {
    const problems = diagnose('---\nschema: spec/v1\n\ttitle: x\n---\n');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ line: 3, severity: 'error' });
    expect(problems[0]?.message).toContain('タブ');
  });

  it('puts a schema error on the line of the offending key, in Japanese', () => {
    const doc = template('spec/standard-ja.md').replace(/^版: .*$/m, '版: abc');
    const versionLine = doc.split('\n').findIndex((l) => l.startsWith('版:')) + 1;
    const problems = diagnose(doc);
    expect(problems.length).toBeGreaterThan(0);
    const hit = problems.find((p) => p.line === versionLine);
    expect(hit?.severity).toBe('error');
    expect(hit?.message).toContain('SemVer');
  });

  it('puts a missing required property on the declaration line', () => {
    const doc = '---\nschemaVersion: spec/v1\n---\n';
    const problems = diagnose(doc);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((p) => p.line === 2 && p.severity === 'error')).toBe(true);
  });
});
