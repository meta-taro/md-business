import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseTsv, validateTsv } from '@md-business/schema-test-spec-tsv';
import { MemoryDocumentStore } from './store.js';
import { validateDocument } from './tools.js';

/**
 * `examples/` に置いた実物の文書が、配布テンプレートと同じく検証を通ること。
 * -----------------------------------------------------------------------------
 * `templates/` が「白紙の型」なのに対し、`examples/` は「中身の入った実物」で、
 * リポジトリを見に来た人が最初に開く。壊れた例を配ると、読んだ人が壊れた形を真似る。
 *
 * 一覧を手で並べず走査するのは、例を足したときに検証から漏れないようにするため。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.resolve(here, '../../../examples');

/** `examples/` 配下のファイルを拡張子で拾う（入れ子のフォルダも辿る）。 */
function collect(extension: string, dir = examplesDir, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(extension, full, found);
    else if (entry.name.endsWith(extension)) found.push(path.relative(examplesDir, full));
  }
  return found.sort();
}

/**
 * 検証の対象は `スキーマ:` を宣言している文書だけ。README には frontmatter が無く、
 * 調査の根拠（`evidence/EV-001.md`）は frontmatter を持つが業務文書ではない。
 */
const SCHEMA_DECLARATION = /^(?:スキーマ|schema):/m;

const documents = collect('.md').filter((relative) =>
  SCHEMA_DECLARATION.test(readFileSync(path.resolve(examplesDir, relative), 'utf8')),
);
const sheets = collect('.tsv');

describe('examples/ の Markdown', () => {
  it('検証すべき例が置かれている', () => {
    expect(documents.length).toBeGreaterThan(0);
  });

  it.each(documents)('%s が valid になる', async (relative) => {
    const source = readFileSync(path.resolve(examplesDir, relative), 'utf8');
    const store = new MemoryDocumentStore({ 'doc.md': source });
    const result = await validateDocument(store, 'doc.md');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('examples/ の検証シート', () => {
  it('検証すべきシートが置かれている', () => {
    expect(sheets.length).toBeGreaterThan(0);
  });

  it.each(sheets)('%s が列の型どおりに読める', (relative) => {
    const source = readFileSync(path.resolve(examplesDir, relative), 'utf8');
    const doc = parseTsv(source);

    expect(doc.columns.length).toBeGreaterThan(0);
    expect(doc.rows.length).toBeGreaterThan(0);
    expect(validateTsv(doc)).toEqual([]);
  });
});
