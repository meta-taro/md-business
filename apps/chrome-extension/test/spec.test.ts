import { describe, it, expect } from 'vitest';
import { specPlugin } from '../src/plugins/spec.js';
import { loadMarkdown } from '../src/shared/loadMarkdown.js';
import { previewMarkdown } from '../src/shared/loadMarkdown.js';

const VALID_SPEC_MD = `---
schemaVersion: "spec/v1"
documentNumber: "SPEC-2026-0001"
title: "テスト仕様書"
version: "1.0.0"
issueDate: "2026-06-17"
status: "draft"
authors:
  - name: "田中"
    role: "PdM"
---

# 第1章 概要

これは本文の段落です。

## 1.1 背景

- リスト項目 1
- リスト項目 2

\`\`\`ts
const x = 1;
\`\`\`
`;

const JAPANESE_KEYED_MD = `---
文書番号: "SPEC-J-001"
タイトル: "日本語キー仕様書"
版: "0.2.0"
発行日: "2026-06-17"
ステータス: "レビュー中"
作成者:
  - 名前: "山田"
    役割: "リード"
レビュアー:
  - 名前: "佐藤"
テーマ: "赤"
---

# 概要
`;

describe('specPlugin — validate path', () => {
  it('accepts a fully English-keyed valid spec', () => {
    const result = specPlugin.validate({
      schemaVersion: 'spec/v1',
      documentNumber: 'SPEC-1',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      authors: [{ name: 'X' }],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects missing required documentNumber with translated message', () => {
    const result = specPlugin.validate({
      schemaVersion: 'spec/v1',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      authors: [{ name: 'X' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/文書番号/);
  });

  it('autofills defaults for Japanese-keyed minimal frontmatter', () => {
    const result = specPlugin.validate({
      文書番号: 'SPEC-J-001',
      タイトル: '最小',
      発行日: '2026-06-17',
      作成者: [{ 名前: '田中' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.version).toBe('0.1.0');
    expect(result.data.status).toBe('draft');
    expect(result.data.toc).toBe('auto');
  });
});

describe('specPlugin — render with body', () => {
  it('embeds the converted Markdown body into the spec layout', () => {
    const result = specPlugin.validate({
      schemaVersion: 'spec/v1',
      documentNumber: 'SPEC-2',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      authors: [{ name: 'X' }],
    });
    if (!result.ok) throw new Error('expected ok');
    const html = specPlugin.render(result.data, '# 第1章\n\n本文段落');
    expect(html).toContain('mdb-spec__body');
    expect(html).toContain('<h1>第1章</h1>');
    expect(html).toContain('<p>本文段落</p>');
  });

  it('renders cover only when no body is provided', () => {
    const result = specPlugin.validate({
      schemaVersion: 'spec/v1',
      documentNumber: 'SPEC-3',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      authors: [{ name: 'X' }],
    });
    if (!result.ok) throw new Error('expected ok');
    const html = specPlugin.render(result.data);
    expect(html).toContain('mdb-spec__cover');
    expect(html).not.toContain('mdb-spec__body');
  });
});

describe('specPlugin — previewRender', () => {
  it('returns HTML even when required fields are missing', () => {
    const result = specPlugin.previewRender?.({ title: 'まだ書きかけ' }, '# 下書き');
    expect(result).toBeDefined();
    if (!result) return;
    expect(result.html).toContain('mdb-spec');
    expect(result.html).toContain('<h1>下書き</h1>');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('translates errors to Japanese', () => {
    const result = specPlugin.previewRender?.({}, '');
    if (!result) throw new Error('expected previewRender');
    expect(result.errors.map((e) => e.message).join('\n')).toMatch(/必須/);
  });

  it('threads normalize/autofill warnings through', () => {
    const result = specPlugin.previewRender?.(
      {
        文書番号: 'SPEC-W',
        タイトル: 'auto warning',
        発行日: '2026-06-17',
        作成者: [{ 名前: '田中' }],
        目次: '手動',
      },
      '',
    );
    if (!result) throw new Error('expected previewRender');
    expect(result.warnings.join('\n')).toMatch(/章ファイル/);
  });
});

describe('specPlugin — documentTitle / pdfFileName', () => {
  it('uses the spec title as the document title', () => {
    expect(
      specPlugin.documentTitle?.({
        schemaVersion: 'spec/v1',
        documentNumber: 'SPEC-1',
        title: 'EC 注文管理',
        version: '1.0.0',
        issueDate: '2026-06-17',
        status: 'draft',
        authors: [{ name: 'X' }],
      }),
    ).toBe('EC 注文管理');
  });

  it('falls back to "基本設計書 {番号}" when title is empty', () => {
    expect(
      specPlugin.documentTitle?.({
        schemaVersion: 'spec/v1',
        documentNumber: 'SPEC-7',
        title: '',
        version: '1.0.0',
        issueDate: '2026-06-17',
        status: 'draft',
        authors: [{ name: 'X' }],
      }),
    ).toBe('基本設計書 SPEC-7');
  });

  it('renders the default PDF file name', () => {
    const name = specPlugin.pdfFileName?.({
      schemaVersion: 'spec/v1',
      documentNumber: 'SPEC-1',
      title: 't',
      version: '1.2.0',
      issueDate: '2026-06-17',
      status: 'draft',
      authors: [{ name: 'X' }],
    });
    expect(name).toBe('基本設計書_SPEC-1_v1.2.0');
  });
});

describe('loadMarkdown — spec end-to-end', () => {
  it('routes a spec/v1 markdown through the registry', () => {
    const result = loadMarkdown(VALID_SPEC_MD);
    if (!result.ok) throw new Error(`expected success: ${result.reason}`);
    expect(result.pluginId).toBe('spec');
    expect(result.stylesHref).toBe('styles/spec.css');
    expect(result.documentTitle).toBe('テスト仕様書');
    expect(result.bodyHtml).toContain('mdb-spec');
    expect(result.bodyHtml).toContain('mdb-spec__body');
    expect(result.bodyHtml).toContain('<h1>第1章 概要</h1>');
    expect(result.bodyHtml).toContain('language-ts');
  });

  it('routes a Japanese-keyed spec via plugin.detect', () => {
    const result = loadMarkdown(JAPANESE_KEYED_MD);
    if (!result.ok) throw new Error(`expected success: ${result.reason}`);
    expect(result.pluginId).toBe('spec');
    expect(result.documentTitle).toBe('日本語キー仕様書');
  });
});

describe('previewMarkdown — spec live editor', () => {
  it('returns body HTML even when required fields are missing', () => {
    const partial = `---\ntitle: "途中"\n文書番号: "SPEC-X"\n---\n\n# 章1`;
    const result = previewMarkdown(partial);
    if (!result.ok) throw new Error('expected success');
    expect(result.bodyHtml).toContain('<h1>章1</h1>');
  });
});
