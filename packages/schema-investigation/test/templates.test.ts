import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import validate from '../dist/validate.compiled.js';
import { parseInvestigationMarkdown } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(here, '../../../templates/investigation');

function loadTemplate(name: string): string {
  return readFileSync(path.resolve(templatesDir, name), 'utf8');
}

describe('templates/investigation/standard-ja.md', () => {
  it('parses and validates end-to-end with no warnings', () => {
    const result = parseInvestigationMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
  });

  it('normalizes the Japanese frontmatter to the canonical shape', () => {
    const result = parseInvestigationMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inv = result.investigation;
    expect(inv.schema).toBe('investigation/v1');
    expect(inv.kind).toBe('log');
    expect(inv.status).toBe('investigating');
    expect(inv.theme).toBe('blue');
    expect(inv.targets[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(inv.tools[0]?.version).toBe('0.9.0');
    expect(inv.findings?.map((f) => f.id)).toEqual(['F-01', 'F-02']);
    expect(inv.findings?.[0]?.severity).toBe('high');
  });

  it('cites an Evidence file for every finding', () => {
    const result = parseInvestigationMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const finding of result.investigation.findings ?? []) {
      expect(finding.evidence.length).toBeGreaterThan(0);
      for (const ref of finding.evidence) {
        expect(ref).toMatch(/^evidence\/EV-\d{3,}\.md$/);
      }
    }
  });

  it('keeps the body after the frontmatter', () => {
    const result = parseInvestigationMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toContain('## 経緯');
    expect(result.body).toContain('## 所見');
  });
});
