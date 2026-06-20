import { describe, it, expect } from 'vitest';
import { testSpecPlugin } from '../src/plugins/test-spec.js';
import { loadMarkdown, previewMarkdown } from '../src/shared/loadMarkdown.js';

const VALID_TEST_SPEC_MD = `---
schema: "test-spec/v1"
documentNumber: "TEST-2026-001"
title: "ログイン機能 検証シート"
version: "0.1.0"
issueDate: "2026-06-18"
status: "draft"
authors:
  - name: "田中"
    role: "QA"
columns:
  - name: "項目"
    type: "text"
  - name: "結果"
    type: "enum"
    values: ["OK", "NG"]
---

# 検証手順

| 項目 | 結果 |
| --- | --- |
| ログイン成功 | OK |
| ログイン失敗 | OK |
`;

const JAPANESE_KEYED_TEST_SPEC_MD = `---
文書番号: "TEST-J-001"
タイトル: "日本語キー検証シート"
版: "0.1.0"
発行日: "2026-06-18"
ステータス: "レビュー中"
作成者:
  - 名前: "山田"
レビュアー:
  - 名前: "佐藤"
列:
  - 名前: "項目"
    型: "文字列"
  - 名前: "結果"
    型: "プルダウン"
    値: ["OK", "NG"]
テーマ: "青"
---

# 概要
`;

describe('testSpecPlugin — validate path', () => {
  it('accepts a fully English-keyed valid test-spec', () => {
    const result = testSpecPlugin.validate({
      schema: 'test-spec/v1',
      documentNumber: 'TEST-1',
      title: 't',
      version: '0.1.0',
      issueDate: '2026-06-18',
      status: 'draft',
      authors: [{ name: 'X' }],
      columns: [{ name: '項目', type: 'text' }],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects missing required documentNumber with translated message', () => {
    const result = testSpecPlugin.validate({
      schema: 'test-spec/v1',
      title: 't',
      version: '0.1.0',
      issueDate: '2026-06-18',
      status: 'draft',
      authors: [{ name: 'X' }],
      columns: [{ name: '項目', type: 'text' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/文書番号/);
  });

  it('autofills defaults for Japanese-keyed minimal frontmatter', () => {
    const result = testSpecPlugin.validate({
      文書番号: 'TEST-J-001',
      タイトル: '最小',
      発行日: '2026-06-18',
      作成者: [{ 名前: '田中' }],
      列: [{ 名前: '項目', 型: '文字列' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.version).toBe('0.1.0');
    expect(result.data.status).toBe('draft');
    expect(result.data.schema).toBe('test-spec/v1');
  });

  it('preserves the optional repository field through validation', () => {
    const result = testSpecPlugin.validate({
      schema: 'test-spec/v1',
      documentNumber: 'TEST-R',
      title: 't',
      version: '0.1.0',
      issueDate: '2026-06-18',
      status: 'draft',
      authors: [{ name: 'X' }],
      columns: [{ name: '項目', type: 'text' }],
      repository: 'meta-taro/md-business@main:verify/login.md',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.repository).toBe('meta-taro/md-business@main:verify/login.md');
  });
});

describe('testSpecPlugin — render with body', () => {
  it('embeds the converted Markdown body into the test-spec layout', () => {
    const result = testSpecPlugin.validate({
      schema: 'test-spec/v1',
      documentNumber: 'TEST-2',
      title: 't',
      version: '0.1.0',
      issueDate: '2026-06-18',
      status: 'draft',
      authors: [{ name: 'X' }],
      columns: [{ name: '項目', type: 'text' }],
    });
    if (!result.ok) throw new Error('expected ok');
    const html = testSpecPlugin.render(
      result.data,
      '# 検証手順\n\n| 項目 | 結果 |\n| --- | --- |\n| OK | OK |',
    );
    expect(html).toContain('mdb-test-spec__body');
    expect(html).toContain('<h1>検証手順</h1>');
    expect(html).toContain('<table>');
  });

  it('renders cover and columns even with no body', () => {
    const result = testSpecPlugin.validate({
      schema: 'test-spec/v1',
      documentNumber: 'TEST-3',
      title: 't',
      version: '0.1.0',
      issueDate: '2026-06-18',
      status: 'draft',
      authors: [{ name: 'X' }],
      columns: [{ name: '項目', type: 'text' }],
    });
    if (!result.ok) throw new Error('expected ok');
    const html = testSpecPlugin.render(result.data);
    expect(html).toContain('mdb-test-spec__cover');
    expect(html).toContain('mdb-test-spec__columns');
    expect(html).not.toContain('mdb-test-spec__body');
  });
});

describe('testSpecPlugin — previewRender', () => {
  it('returns HTML even when required fields are missing', () => {
    const result = testSpecPlugin.previewRender?.({ title: 'まだ書きかけ' }, '# 下書き');
    expect(result).toBeDefined();
    if (!result) return;
    expect(result.html).toContain('mdb-test-spec');
    expect(result.html).toContain('<h1>下書き</h1>');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('translates errors to Japanese', () => {
    const result = testSpecPlugin.previewRender?.({}, '');
    if (!result) throw new Error('expected previewRender');
    expect(result.errors.map((e) => e.message).join('\n')).toMatch(/必須/);
  });

  it('threads autofill warnings through (e.g. enum without values)', () => {
    const result = testSpecPlugin.previewRender?.(
      {
        schema: 'test-spec/v1',
        documentNumber: 'TEST-W',
        title: 'warn',
        version: '0.1.0',
        issueDate: '2026-06-18',
        status: 'draft',
        authors: [{ name: '田中' }],
        columns: [
          { name: '結果', type: 'enum' },
        ],
      },
      '',
    );
    if (!result) throw new Error('expected previewRender');
    expect(result.warnings.join('\n')).toMatch(/enum|values|プルダウン/);
  });
});

describe('testSpecPlugin — documentTitle / pdfFileName', () => {
  const ok = {
    schema: 'test-spec/v1' as const,
    documentNumber: 'TEST-T',
    title: 'EC ログイン検証',
    version: '0.1.0',
    issueDate: '2026-06-18',
    status: 'draft' as const,
    authors: [{ name: 'X' }],
    columns: [{ name: '項目', type: 'text' as const }],
  };

  it('uses the test-spec title as the document title', () => {
    expect(testSpecPlugin.documentTitle?.(ok)).toBe('EC ログイン検証');
  });

  it('falls back to "検証シート {番号}" when title is empty', () => {
    expect(
      testSpecPlugin.documentTitle?.({ ...ok, title: '' }),
    ).toBe('検証シート TEST-T');
  });

  it('renders the default PDF file name', () => {
    expect(testSpecPlugin.pdfFileName?.(ok)).toBe('検証シート_TEST-T_v0.1.0');
  });
});

describe('testSpecPlugin.detect', () => {
  it('claims documents with Japanese marker keys', () => {
    expect(testSpecPlugin.detect?.({ 列: [] })).toBe(true);
    expect(testSpecPlugin.detect?.({ 列定義: [] })).toBe(true);
    expect(testSpecPlugin.detect?.({ シートID: 'x' })).toBe(true);
    expect(testSpecPlugin.detect?.({ 連携シートID: 'x' })).toBe(true);
  });

  it('claims documents with English marker keys', () => {
    expect(testSpecPlugin.detect?.({ columns: [] })).toBe(true);
    expect(testSpecPlugin.detect?.({ googleSheetId: 'x' })).toBe(true);
  });

  it('does not claim unrelated documents', () => {
    expect(testSpecPlugin.detect?.({ title: 'note' })).toBe(false);
    expect(testSpecPlugin.detect?.({ 請求書番号: 'INV-1' })).toBe(false);
  });

  it('does not steal documents with only reviewers / レビュアー (spec owns them)', () => {
    expect(testSpecPlugin.detect?.({ reviewers: [] })).toBe(false);
    expect(testSpecPlugin.detect?.({ レビュアー: [] })).toBe(false);
  });
});

describe('loadMarkdown — test-spec end-to-end', () => {
  it('routes a test-spec/v1 markdown through the registry via schema prefix', () => {
    const result = loadMarkdown(VALID_TEST_SPEC_MD);
    if (!result.ok) throw new Error(`expected success: ${result.reason}`);
    expect(result.pluginId).toBe('test-spec');
    expect(result.stylesHref).toBe('styles/test-spec.css');
    expect(result.documentTitle).toBe('ログイン機能 検証シート');
    expect(result.bodyHtml).toContain('mdb-test-spec');
    expect(result.bodyHtml).toContain('mdb-test-spec__body');
    expect(result.bodyHtml).toContain('<h1>検証手順</h1>');
  });

  it('routes a Japanese-keyed test-spec via plugin.detect', () => {
    const result = loadMarkdown(JAPANESE_KEYED_TEST_SPEC_MD);
    if (!result.ok) throw new Error(`expected success: ${result.reason}`);
    expect(result.pluginId).toBe('test-spec');
    expect(result.documentTitle).toBe('日本語キー検証シート');
  });
});

describe('previewMarkdown — test-spec live editor', () => {
  it('returns body HTML even when required fields are missing', () => {
    const partial = `---\nschema: "test-spec/v1"\ntitle: "途中"\n文書番号: "TEST-X"\n---\n\n# 章1`;
    const result = previewMarkdown(partial);
    if (!result.ok) throw new Error('expected success');
    expect(result.bodyHtml).toContain('<h1>章1</h1>');
  });
});
