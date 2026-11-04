import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { investigationPlugin } from '../src/plugins/investigation.js';
import { createDefaultRegistry } from '../src/plugins/index.js';
import { loadMarkdown, previewMarkdown } from '../src/shared/loadMarkdown.js';

const TEMPLATE = readFileSync(
  resolve(__dirname, '..', '..', '..', 'templates', 'investigation', 'standard-ja.md'),
  'utf8',
);

describe('investigationPlugin — detect', () => {
  it('claims Japanese-keyed reports by 所見 / 対象ファイル / 使用ツール', () => {
    expect(investigationPlugin.detect?.({ 所見: [] })).toBe(true);
    expect(investigationPlugin.detect?.({ 対象ファイル: [] })).toBe(true);
    expect(investigationPlugin.detect?.({ tools: [] })).toBe(true);
  });

  it('does not claim a plain spec', () => {
    expect(investigationPlugin.detect?.({ 文書番号: 'SPEC-1', レビュアー: [] })).toBe(false);
  });

  it('wins over spec when a report also carries 文書番号 / レビュアー', () => {
    const registry = createDefaultRegistry();
    const plugin = registry.resolve({ 文書番号: 'INV-1', レビュアー: [], 所見: [] });
    expect(plugin?.id).toBe('investigation');
  });
});

describe('investigationPlugin — template', () => {
  it('loads the shipped template without errors', () => {
    const result = loadMarkdown(TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pluginId).toBe('investigation');
    expect(result.stylesHref).toBe('styles/investigation.css');
    expect(result.bodyHtml).toContain('F-01');
    // 本文の Markdown も表紙の後ろに続く
    expect(result.bodyHtml).toContain('経緯');
    expect(result.pdfFileName).toContain('INV-2026-0001');
  });

  it('drops script tags from the body', () => {
    const md = TEMPLATE.replace('## 経緯', ['<script>alert(1)</script>', '', '## 経緯'].join('\n'));
    const result = loadMarkdown(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bodyHtml).not.toContain('<script');
  });
});

describe('investigationPlugin — preview', () => {
  it('still paints a half-written report and lists what is missing', () => {
    const result = previewMarkdown(['---', '所見: []', '---', '', '# 書きかけ', ''].join('\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pluginId).toBe('investigation');
    expect(result.bodyHtml).not.toBe('');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
