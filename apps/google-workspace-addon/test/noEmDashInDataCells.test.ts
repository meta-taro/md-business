import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const FORBIDDEN_PLACEHOLDERS = ['—', '–', '―', 'N/A', 'n/a', 'TBD', 'tbd'];

const TARGET_FILES = [
  'templates/test-spec/standard-ja.md',
  'templates/spec/standard-ja.md',
  'templates/invoice/standard.md',
  'templates/invoice/standard-ja.md',
  'templates/invoice/inbound-eligible.md',
  'templates/invoice/tax-exempt-ja.md',
  'docs/test-spec/sample.md',
];

interface CellViolation {
  line: number;
  column: number;
  cell: string;
}

function stripFrontmatter(md: string): { body: string; offset: number } {
  if (!md.startsWith('---\n')) return { body: md, offset: 0 };
  const end = md.indexOf('\n---\n', 4);
  if (end === -1) return { body: md, offset: 0 };
  const bodyStart = end + 5;
  const offset = md.slice(0, bodyStart).split('\n').length - 1;
  return { body: md.slice(bodyStart), offset };
}

function findTableCellViolations(md: string): CellViolation[] {
  const { body, offset } = stripFrontmatter(md);
  const violations: CellViolation[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    if (!raw.trim().startsWith('|') || !raw.trim().endsWith('|')) continue;
    const inner = raw.trim().slice(1, -1);
    const cells = inner.split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    cells.forEach((cell, col) => {
      if (FORBIDDEN_PLACEHOLDERS.includes(cell)) {
        violations.push({ line: offset + i + 1, column: col + 1, cell });
      }
    });
  }
  return violations;
}

describe('テンプレ・サンプル md の表データセルに em-dash 系 placeholder が混入していない (#50)', () => {
  for (const relPath of TARGET_FILES) {
    it(relPath, () => {
      const abs = resolve(repoRoot, relPath);
      const content = readFileSync(abs, 'utf8');
      const violations = findTableCellViolations(content);
      expect(violations).toEqual([]);
    });
  }
});

describe('findTableCellViolations 単体テスト (検出ロジックの自己検証)', () => {
  it('em-dash を含む表セルを検出する', () => {
    const md = '| 項目 | 値 |\n|---|---|\n| 実施日 | — |\n';
    const violations = findTableCellViolations(md);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.cell).toBe('—');
  });

  it('en-dash / horizontal-bar / N/A / TBD も検出する', () => {
    const md = '| a | b |\n|---|---|\n| – | ― |\n| N/A | TBD |\n';
    const violations = findTableCellViolations(md);
    expect(violations.map((v) => v.cell).sort()).toEqual(['N/A', 'TBD', '–', '―']);
  });

  it('表区切り行 (|---|---|) は誤検出しない', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    const violations = findTableCellViolations(md);
    expect(violations).toEqual([]);
  });

  it('空セルは違反としない', () => {
    const md = '| a | b |\n|---|---|\n|  |  |\n';
    const violations = findTableCellViolations(md);
    expect(violations).toEqual([]);
  });

  it('frontmatter 内の em-dash は対象外', () => {
    const md = '---\ntitle: — メモ\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const violations = findTableCellViolations(md);
    expect(violations).toEqual([]);
  });

  it('散文中の em-dash (表外) は対象外', () => {
    const md = 'これは説明文 — つまり em-dash を含む。\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const violations = findTableCellViolations(md);
    expect(violations).toEqual([]);
  });
});
