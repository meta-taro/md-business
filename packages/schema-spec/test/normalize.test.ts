import { describe, it, expect } from 'vitest';
import { normalizeSpecFrontmatter } from '../src/index.js';

describe('normalizeSpecFrontmatter — root scope', () => {
  it('returns empty data when given a non-object', () => {
    expect(normalizeSpecFrontmatter(null).data).toEqual({});
    expect(normalizeSpecFrontmatter('x').data).toEqual({});
    expect(normalizeSpecFrontmatter(42).data).toEqual({});
  });

  it('translates all canonical Japanese root keys to English', () => {
    const { data, warnings } = normalizeSpecFrontmatter({
      スキーマ: 'spec/v1',
      文書番号: 'SPEC-2026-001',
      タイトル: '注文管理サブシステム 基本設計書',
      版: '0.1.0',
      発行日: '2026-06-17',
      ステータス: 'ドラフト',
      作成者: [{ 名前: '田中', 役割: 'Tech Lead' }],
      レビュアー: [{ 名前: '佐藤' }],
      関連文書: ['./PRD.md'],
      章ファイル: ['01-overview.md'],
      目次: '自動',
      テーマ: '青',
      ファイル名: '{documentNumber}.pdf',
    });
    expect(warnings).toEqual([]);
    expect(data).toMatchObject({
      schemaVersion: 'spec/v1',
      documentNumber: 'SPEC-2026-001',
      title: '注文管理サブシステム 基本設計書',
      version: '0.1.0',
      issueDate: '2026-06-17',
      status: 'draft',
      reviewers: [{ name: '佐藤' }],
      relatedDocs: ['./PRD.md'],
      chapters: ['01-overview.md'],
      toc: 'auto',
      theme: 'blue',
      fileName: '{documentNumber}.pdf',
    });
    expect(data.authors).toEqual([{ name: '田中', role: 'Tech Lead' }]);
  });

  it('accepts English keys verbatim (idempotent)', () => {
    const english = {
      schemaVersion: 'spec/v1',
      documentNumber: 'SPEC-2026-001',
      title: 't',
      version: '0.1.0',
      issueDate: '2026-06-17',
      status: 'draft',
      authors: [{ name: 'a' }],
    };
    const { data } = normalizeSpecFrontmatter(english);
    expect(data).toMatchObject(english);
  });
});

describe('normalizeSpecFrontmatter — status translations', () => {
  it.each([
    ['ドラフト', 'draft'],
    ['下書き', 'draft'],
    ['レビュー中', 'review'],
    ['レビュー', 'review'],
    ['査読中', 'review'],
    ['承認済', 'approved'],
    ['承認済み', 'approved'],
    ['確定', 'approved'],
    ['draft', 'draft'],
    ['review', 'review'],
    ['approved', 'approved'],
  ])('maps status "%s" → "%s"', (input, expected) => {
    const { data } = normalizeSpecFrontmatter({ ステータス: input });
    expect(data.status).toBe(expected);
  });

  it('passes through an unknown status value (Ajv will reject)', () => {
    const { data } = normalizeSpecFrontmatter({ ステータス: '保留' });
    expect(data.status).toBe('保留');
  });
});

describe('normalizeSpecFrontmatter — toc translations', () => {
  it.each([
    ['自動', 'auto'],
    ['手動', 'manual'],
    ['auto', 'auto'],
    ['manual', 'manual'],
  ])('maps toc "%s" → "%s"', (input, expected) => {
    const { data } = normalizeSpecFrontmatter({ 目次: input });
    expect(data.toc).toBe(expected);
  });
});

describe('normalizeSpecFrontmatter — theme translations', () => {
  it.each([
    ['青', 'blue'],
    ['ブルー', 'blue'],
    ['赤', 'red'],
    ['オレンジ', 'orange'],
    ['黒', 'black'],
    ['グレー', 'gray'],
  ])('maps theme "%s" → "%s"', (input, expected) => {
    const { data } = normalizeSpecFrontmatter({ テーマ: input });
    expect(data.theme).toBe(expected);
  });

  it('trims whitespace and passes hex codes through', () => {
    const { data } = normalizeSpecFrontmatter({ テーマ: '  #2a4d7a  ' });
    expect(data.theme).toBe('#2a4d7a');
  });
});

describe('normalizeSpecFrontmatter — party scope', () => {
  it('translates author/reviewer names and roles', () => {
    const { data } = normalizeSpecFrontmatter({
      作成者: [
        { 名前: '田中', 役割: 'Tech Lead' },
        { 氏名: '鈴木', 役職: 'Engineer' },
      ],
      レビュアー: [{ 名称: '佐藤', 肩書き: 'PM' }],
    });
    expect(data.authors).toEqual([
      { name: '田中', role: 'Tech Lead' },
      { name: '鈴木', role: 'Engineer' },
    ]);
    expect(data.reviewers).toEqual([{ name: '佐藤', role: 'PM' }]);
  });
});

describe('normalizeSpecFrontmatter — warnings', () => {
  it('warns when two source keys collapse to the same target', () => {
    const { warnings } = normalizeSpecFrontmatter({
      タイトル: 'A',
      表題: 'B',
    });
    expect(warnings.length).toBeGreaterThan(0);
    const first = warnings[0]!;
    expect(first.path).toBe('title');
    expect(first.message).toContain('title');
  });

  it('reports nested collision paths', () => {
    const { warnings } = normalizeSpecFrontmatter({
      作成者: [{ 名前: '田中', 氏名: '田中太郎' }],
    });
    expect(warnings.some((w) => w.path === 'authors[0].name')).toBe(true);
  });
});

describe('normalizeSpecFrontmatter — pass-through unknown keys', () => {
  it('keeps unknown root keys verbatim for Ajv to surface', () => {
    const { data } = normalizeSpecFrontmatter({ 不明: 'x', タイトル: 't' });
    expect(data).toMatchObject({ 不明: 'x', title: 't' });
  });
});
