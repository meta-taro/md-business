import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { splitFrontmatter } from '@md-business/core';
import { MemoryDocumentStore } from './store.js';
import { validateDocument, createDocument } from './tools.js';

/**
 * 日本語キーの frontmatter が MCP 経由で検証を通ること。
 * -----------------------------------------------------------------------------
 * 各 schema パッケージは日本語キー → 正準キーの正規化関数を公開しており、md-business の
 * 文書は日本語キーで書けるのが売り。MCP のツール群はその正規化を通さずに Ajv へ渡していた
 * ため、正しい日本語文書が必ず invalid になっていた（配布テンプレ全滅）。
 *
 * 素の JSON Schema をそのまま当てるのは英語キーの文書に対してのみ正しい。ここでは
 * **実際に配布しているテンプレート**を読んで検証し、日英どちらのキーでも通ることを固定する。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(here, '../../../templates');

function loadTemplate(relative: string): string {
  return readFileSync(path.resolve(templatesDir, relative), 'utf8');
}

/** 日本語キーで書かれた配布テンプレート（`スキーマ:` 宣言を持つもの）。 */
const JA_TEMPLATES = [
  'invoice/standard-ja.md',
  'invoice/tax-exempt-ja.md',
  'spec/standard-ja.md',
  'test-spec/standard-ja.md',
  'api-spec/standard-ja.md',
] as const;

/** 英語キーで書かれた配布テンプレート（正規化を挟んでも壊れてはならない）。 */
const EN_TEMPLATES = ['invoice/standard.md', 'invoice/inbound-eligible.md'] as const;

describe('validate_document — 日本語キーの frontmatter', () => {
  it.each(JA_TEMPLATES)('%s が valid になる', async (relative) => {
    const store = new MemoryDocumentStore({ 'doc.md': loadTemplate(relative) });
    const result = await validateDocument(store, 'doc.md');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each(EN_TEMPLATES)('%s は引き続き valid のまま', async (relative) => {
    const store = new MemoryDocumentStore({ 'doc.md': loadTemplate(relative) });
    const result = await validateDocument(store, 'doc.md');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('日本語キーでも欠落した必須項目は検出する（正規化が検証を素通しにしない）', async () => {
    const { data } = splitFrontmatter(loadTemplate('invoice/standard-ja.md'));
    delete data['請求書番号'];
    const store = new MemoryDocumentStore({ 'doc.md': `---\n${yamlish(data)}---\n` });

    const result = await validateDocument(store, 'doc.md');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('invoiceNumber'))).toBe(true);
  });
});

describe('create_document — 日本語キーの frontmatter', () => {
  it('日本語キーで書き込めて valid になる', async () => {
    const { data, body } = splitFrontmatter(loadTemplate('invoice/standard-ja.md'));
    const store = new MemoryDocumentStore();

    const result = await createDocument(store, {
      schema: 'invoice/v1',
      frontmatter: data,
      body,
      path: 'invoices/ja.md',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('書き込んだ文書は日本語キーのまま（検証のために英語へ書き換えない）', async () => {
    const { data, body } = splitFrontmatter(loadTemplate('invoice/standard-ja.md'));
    const store = new MemoryDocumentStore();

    await createDocument(store, {
      schema: 'invoice/v1',
      frontmatter: data,
      body,
      path: 'invoices/ja.md',
    });

    const written = await store.read('invoices/ja.md');
    expect(written).toContain('請求書番号:');
    expect(written).not.toContain('invoiceNumber:');
  });
});

/** テスト用の素朴な YAML 直列化（frontmatter の一部を落として組み直すだけ）。 */
function yamlish(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  return `${lines.join('\n')}\n`;
}
