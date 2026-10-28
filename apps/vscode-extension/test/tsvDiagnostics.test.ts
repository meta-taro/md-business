import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diagnoseTsv, isTestSpecTsv } from '../src/tsvDiagnostics.js';

const ROOT = resolve(__dirname, '../../..');

const SHEET = [
  '#! md-business:test-spec-tsv/v1',
  '# タイトル: 例',
  '',
  'No.:number!\t項目:text!\t結果:enum(OK|NG|未実施)',
  '1\tログイン\t未実施',
  '2\t\t未実施',
  '3\tログアウト\tたぶん',
].join('\n');

describe('isTestSpecTsv', () => {
  it('accepts the marker on the first non-blank line', () => {
    expect(isTestSpecTsv('\n#! md-business:test-spec-tsv/v1  \nNo.\n')).toBe(true);
  });

  it('rejects other text', () => {
    expect(isTestSpecTsv('a\tb\n1\t2\n')).toBe(false);
    expect(isTestSpecTsv(' #! md-business:test-spec-tsv/v1\n')).toBe(false);
  });
});

describe('diagnoseTsv', () => {
  it('reports nothing for a TSV without the marker', () => {
    expect(diagnoseTsv('a\tb\n\t\n')).toEqual([]);
  });

  it.each(['templates/test-spec/standard-ja.tsv', 'examples/project-docs/test-spec.tsv'])(
    'reports nothing for the shipped sheet %s',
    (path) => {
      expect(diagnoseTsv(readFileSync(resolve(ROOT, path), 'utf8'))).toEqual([]);
    },
  );

  it('points each issue at the physical line of its row', () => {
    const problems = diagnoseTsv(SHEET);
    expect(problems.map((p) => p.line)).toEqual([6, 7]);
    expect(problems.every((p) => p.severity === 'error')).toBe(true);
    expect(problems[0]?.message).toContain('項目');
    expect(problems[1]?.message).toContain('結果');
  });

  it('keeps line numbers right with CRLF and comment lines between rows', () => {
    const text = SHEET.replace('2\t\t未実施', '#@ hidden\n2\t\t未実施').replace(/\n/g, '\r\n');
    expect(diagnoseTsv(text).map((p) => p.line)).toEqual([7, 8]);
  });
});
