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

/**
 * `.tsv` は 2 種類ある。検証シート（先頭行の印で分かる）と、図の元になる素の表。
 * 素の表に検証シートの規則を当てると、列の型を書いていないだけで落ちる。
 */
const TSV_MAGIC = '#! md-business:test-spec-tsv/v1';

const allSheets = collect('.tsv');
const sheets = allSheets.filter((relative) =>
  readFileSync(path.resolve(examplesDir, relative), 'utf8').startsWith(TSV_MAGIC),
);
const tables = allSheets.filter((relative) => !sheets.includes(relative));

/** 覚え書き（`#` で始まる行）と空行を落として、見出しと行に分ける。 */
function readTable(relative: string): { columns: string[]; rows: string[][] } {
  const lines = readFileSync(path.resolve(examplesDir, relative), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));
  const columns = (lines[0] ?? '').split('\t').map((name) => name.trim());
  return { columns, rows: lines.slice(1).map((line) => line.split('\t')) };
}

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

/**
 * 図の元になる素の表（`docs/spec/snapshot-tsv-v1.md`）。
 *
 * 数字そのものより、**いつ・どこから取った数字か**が落ちていないことを見る。
 * それが無い表は、後から見ても使えない（同じ日付の行が 2 つあったとき、
 * どちらが新しいのかも分からなくなる）。
 */
describe('examples/ の素の表', () => {
  it('素の表が置かれている', () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  it.each(tables)('%s が表として読める', (relative) => {
    const { columns, rows } = readTable(relative);

    expect(columns.length).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(0);
    // 見出しより多い列を持つ行があると、どの列の値か決まらないまま図に入る。
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(columns.length);
  });

  const snapshots = tables.filter((relative) => relative.split(path.sep)[0] === 'snapshot');

  it('取ってきた数字の例が置かれている', () => {
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it.each(snapshots)('%s が日付と出どころを持つ', (relative) => {
    const { columns, rows } = readTable(relative);

    for (const required of ['日付', '取得日時', '取得元']) {
      expect(columns).toContain(required);
    }
    // 出どころは行ごとに要る（1 つの表へ別の日に取った行が足されるため）。
    for (const name of ['取得日時', '取得元']) {
      const at = columns.indexOf(name);
      for (const row of rows) expect((row[at] ?? '').trim()).not.toEqual('');
    }
  });
});
