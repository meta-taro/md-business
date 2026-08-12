import { describe, it, expect } from 'vitest';
import {
  normalizeInvestigationFrontmatter,
  INVESTIGATION_JA_DICTIONARY,
  KIND_TRANSLATIONS,
  STATUS_TRANSLATIONS,
  SEVERITY_TRANSLATIONS,
  THEME_VALUE_TRANSLATIONS,
} from '../src/index.js';

describe('normalizeInvestigationFrontmatter', () => {
  it('translates Japanese root keys to the canonical shape', () => {
    const { data } = normalizeInvestigationFrontmatter({
      スキーマ: 'investigation/v1',
      種別: 'ログ',
      文書番号: 'INV-2026-001',
      タイトル: 'ログイン失敗の急増',
      作成日時: '2026-08-12T09:30:00+09:00',
      状態: '調査中',
      要約: '認証基盤の一時的な失敗',
      関連文書: ['./../specs/auth.md'],
    });
    expect(data).toMatchObject({
      schema: 'investigation/v1',
      kind: 'log',
      documentNumber: 'INV-2026-001',
      title: 'ログイン失敗の急増',
      createdAt: '2026-08-12T09:30:00+09:00',
      status: 'investigating',
      summary: '認証基盤の一時的な失敗',
      relatedDocs: ['./../specs/auth.md'],
    });
  });

  it('translates nested target / tool / window / finding keys', () => {
    const { data } = normalizeInvestigationFrontmatter({
      対象ファイル: [{ パス: 'logs/app.jsonl', ハッシュ: 'a'.repeat(64), 備考: '本番機' }],
      使用ツール: [{ 名前: 'md-business', 版: '0.9.0' }],
      調査時間帯: { 開始: '2026-08-11T00:00:00+09:00', 終了: '2026-08-12T00:00:00+09:00' },
      所見: [{ 番号: 'F-01', 要約: '認証失敗が集中', 深刻度: '高', 根拠: ['evidence/EV-001.md'] }],
      作成者: [{ 名前: '田中', 役割: '調査担当' }],
    });
    expect(data).toMatchObject({
      targets: [{ path: 'logs/app.jsonl', sha256: 'a'.repeat(64), note: '本番機' }],
      tools: [{ name: 'md-business', version: '0.9.0' }],
      window: { from: '2026-08-11T00:00:00+09:00', to: '2026-08-12T00:00:00+09:00' },
      findings: [
        { id: 'F-01', summary: '認証失敗が集中', severity: 'high', evidence: ['evidence/EV-001.md'] },
      ],
      authors: [{ name: '田中', role: '調査担当' }],
    });
  });

  it.each([
    ['ログ', 'log'],
    ['ログ調査', 'log'],
    ['log', 'log'],
    ['ネットワーク', 'network'],
    ['通信', 'network'],
    ['network', 'network'],
  ])('translates kind %s to %s', (input, expected) => {
    const { data } = normalizeInvestigationFrontmatter({ 種別: input });
    expect(data['kind']).toBe(expected);
  });

  it.each([
    ['調査中', 'investigating'],
    ['完了', 'concluded'],
    ['保留', 'suspended'],
    ['investigating', 'investigating'],
  ])('translates status %s to %s', (input, expected) => {
    const { data } = normalizeInvestigationFrontmatter({ 状態: input });
    expect(data['status']).toBe(expected);
  });

  it.each([
    ['高', 'high'],
    ['中', 'medium'],
    ['低', 'low'],
    ['情報', 'info'],
  ])('translates severity %s to %s', (input, expected) => {
    const { data } = normalizeInvestigationFrontmatter({ 所見: [{ 深刻度: input }] });
    expect((data['findings'] as Array<Record<string, unknown>>)[0]!['severity']).toBe(expected);
  });

  it('translates theme values', () => {
    const { data } = normalizeInvestigationFrontmatter({ テーマ: '青' });
    expect(data['theme']).toBe('blue');
  });

  it('passes unknown keys through verbatim so the schema can report them', () => {
    const { data } = normalizeInvestigationFrontmatter({ 未知: 'x' });
    expect(data['未知']).toBe('x');
  });

  it('warns when two input keys map to the same canonical key', () => {
    const { warnings } = normalizeInvestigationFrontmatter({
      タイトル: 'A',
      表題: 'B',
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('title');
  });

  it('returns an empty object for non-object input', () => {
    expect(normalizeInvestigationFrontmatter('nope').data).toEqual({});
  });

  it('leaves an implausibly deep value untranslated instead of recursing', () => {
    let deep: unknown = { 名前: '田中' };
    for (let i = 0; i < 120; i += 1) deep = [deep];
    const { warnings } = normalizeInvestigationFrontmatter({ 作成者: deep });
    expect(warnings.some((w) => w.message.includes('nested too deeply'))).toBe(true);
  });
});

describe('dictionary exports', () => {
  it('exposes the vocabulary so a viewer can build its own input hints', () => {
    expect(INVESTIGATION_JA_DICTIONARY.root?.['種別']).toBe('kind');
    expect(KIND_TRANSLATIONS['ネットワーク']).toBe('network');
    expect(STATUS_TRANSLATIONS['完了']).toBe('concluded');
    expect(SEVERITY_TRANSLATIONS['高']).toBe('high');
    expect(THEME_VALUE_TRANSLATIONS['青']).toBe('blue');
  });
});
