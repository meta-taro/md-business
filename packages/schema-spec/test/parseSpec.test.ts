import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import validate from '../dist/validate.compiled.js';
import { parseSpecMarkdown, parseSpecObject } from '../src/parseSpec.js';

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '../../../templates/spec');

function loadTemplate(name: string): string {
  return readFileSync(resolve(templatesDir, name), 'utf8');
}

describe('parseSpecMarkdown — Japanese frontmatter end-to-end', () => {
  it('parses templates/spec/standard-ja.md', () => {
    const result = parseSpecMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.schemaVersion).toBe('spec/v1');
    expect(result.spec.documentNumber).toBeTruthy();
    expect(result.spec.title).toBeTruthy();
    expect(result.spec.status).toBe('draft');
    expect(result.spec.toc).toBe('auto');
    expect(result.spec.theme).toBe('blue');
    expect(result.spec.authors.length).toBeGreaterThan(0);
    expect(result.body).toContain('#'); // Markdown body present
  });

  it('returns ok=false with errors when required fields are missing', () => {
    const src = `---\nタイトル: 仕様書\n---\n# 本文\n`;
    const result = parseSpecMarkdown(src, validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('documentNumber'))).toBe(true);
  });
});

describe('parseSpecObject — frontmatter object path', () => {
  it('validates a minimal Japanese-keyed object after autofill', () => {
    const result = parseSpecObject(
      {
        文書番号: 'SPEC-T-001',
        タイトル: 'テスト仕様書',
        発行日: '2026-06-17',
        作成者: [{ 名前: '田中' }],
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // autofill defaults
    expect(result.spec.schemaVersion).toBe('spec/v1');
    expect(result.spec.version).toBe('0.1.0');
    expect(result.spec.status).toBe('draft');
    expect(result.spec.toc).toBe('auto');
  });

  it('surfaces a normalize collision warning alongside validated data', () => {
    const result = parseSpecObject(
      {
        文書番号: 'SPEC-T-002',
        タイトル: '同義語タイトル',
        表題: 'こちらが採用される',
        発行日: '2026-06-17',
        作成者: [{ 名前: '田中' }],
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'title')).toBe(true);
  });

  it('surfaces an autofill warning for toc=manual without chapters', () => {
    const result = parseSpecObject(
      {
        文書番号: 'SPEC-T-003',
        タイトル: '章なし手動目次',
        発行日: '2026-06-17',
        作成者: [{ 名前: '田中' }],
        目次: '手動',
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'chapters')).toBe(true);
  });

  it('fails with ValidationError when an unknown status survives normalization', () => {
    const result = parseSpecObject(
      {
        文書番号: 'SPEC-T-004',
        タイトル: '不明ステータス',
        発行日: '2026-06-17',
        ステータス: '保留',
        作成者: [{ 名前: '田中' }],
      },
      validate,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path.includes('status'))).toBe(true);
  });

  it('fails with ValidationError when the input is not an object', () => {
    const result = parseSpecObject(42, validate);
    expect(result.ok).toBe(false);
  });
});

// A caller that hands in an already-parsed object skips the YAML parser, and
// with it the depth bound the Markdown path gets for free. Key normalisation
// and the compiled validator both recurse, so an unbounded object used to come
// back as a `RangeError` instead of a result.
describe('parseSpecObject — nesting depth', () => {
  /** Nested arrays, which normalisation walks element by element at any depth. */
  function deepArray(levels: number): unknown {
    let node: unknown = 'x';
    for (let i = 0; i < levels; i += 1) node = [node];
    return node;
  }

  it('reports an over-nested object as a validation failure', () => {
    const raw = { authors: deepArray(50_000) };
    let result: ReturnType<typeof parseSpecObject> | undefined;
    expect(() => {
      result = parseSpecObject(raw, validate);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result?.ok === false) {
      const [first] = result.errors;
      expect(first?.keyword).toBe('maxDepth');
      expect(first?.path.startsWith('/authors')).toBe(true);
    }
  });

  it('leaves realistically nested input alone', () => {
    const result = parseSpecObject({ authors: deepArray(3) }, validate);
    // Missing required fields still fail, but never with a depth error.
    if (result.ok === false) {
      expect(result.errors.every((e) => e.keyword !== 'maxDepth')).toBe(true);
    }
  });
});

// Chained YAML aliases expand to a structure whose distinct paths grow as
// `fanout ** levels`, while the source text stays a few hundred bytes and the
// anchor count stays inside its cap. Every downstream walk — the depth guard,
// key normalisation, the validator — pays that expanded cost, so a document
// this small has to be turned away rather than parsed.
describe('parseSpecMarkdown — alias expansion', () => {
  // What the timing assertions below check is whether the guard engaged at all,
  // not how fast the machine is. Without a guard, `12 ** 8` nodes take minutes or
  // exhaust memory, so any bound far below that separates the two cases. The bound
  // is kept well clear of a loaded shared runner: the guarded path measured 528ms
  // and 582ms on CI against ~40ms locally, and a tighter bound only reports jitter.
  const GUARD_ENGAGED_MS = 3_000;

  function aliasBomb(anchors: number, fanout: number): string {
    const lines = ['schemaVersion: spec/v1', 'title: t'];
    lines.push(`a0: &a0 [${Array(fanout).fill('x').join(', ')}]`);
    for (let i = 1; i < anchors; i += 1) {
      lines.push(`a${i}: &a${i} [${Array(fanout).fill(`*a${i - 1}`).join(', ')}]`);
    }
    lines.push(`authors: *a${anchors - 1}`);
    return ['---', ...lines, '---', '# body'].join('\n');
  }

  it('rejects a small document that expands without bound, and does so quickly', () => {
    const src = aliasBomb(8, 12);
    expect(src.length).toBeLessThan(1_000);

    const started = performance.now();
    // Input limits throw rather than returning a result, the same way an
    // oversized block or an excess of anchors does — the document never
    // becomes a value the caller could report errors against.
    expect(() => parseSpecMarkdown(src, validate)).toThrow(/alias/i);
    expect(performance.now() - started).toBeLessThan(GUARD_ENGAGED_MS);
  });

  // The node budget is the backstop for the same attack arriving as an object,
  // where there is no YAML text to count aliases in.
  it('reports an over-expanded object as a validation failure', () => {
    let shared: unknown = ['x'];
    for (let i = 0; i < 8; i += 1) shared = Array.from({ length: 12 }, () => shared);

    const started = performance.now();
    const result = parseSpecObject({ authors: shared }, validate);
    const elapsed = performance.now() - started;

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors[0]?.keyword).toBe('maxNodes');
    }
    expect(elapsed).toBeLessThan(GUARD_ENGAGED_MS);
  });
});
