import { describe, it, expect } from 'vitest';
import { documentDisplayName } from './docTitle';

/**
 * タイトルバー中央の表示名（田中さん要件 2026-07-22）。
 * 文書種別が判るときは frontmatter / メタから「意味のある名前」を組み、
 * 該当しなければファイル名（相対パス末尾）にフォールバックする。
 */

const FALLBACK = 'standard-ja.md';

describe('documentDisplayName', () => {
  it('invoice: 御請求書_{請求先}{敬称}_{発行元}_{YMD} を組む', () => {
    const src = [
      '---',
      'schemaVersion: invoice/v1',
      'invoiceNumber: INV-2026-0002',
      'issueDate: "2026-06-30"',
      'issuer:',
      '  name: 株式会社サンプル商事',
      'recipient:',
      '  name: 株式会社サンプル小売',
      '  honorific: 御中',
      '---',
      '',
    ].join('\n');
    expect(documentDisplayName(src, FALLBACK)).toBe(
      '御請求書_株式会社サンプル小売御中_株式会社サンプル商事_20260630',
    );
  });

  it('invoice: issueDate 欠落時は日付セグメントを省く', () => {
    const src = [
      '---',
      'schemaVersion: invoice/v1',
      'issuer:',
      '  name: 発行元商事',
      'recipient:',
      '  name: 得意先小売',
      '  honorific: 御中',
      '---',
    ].join('\n');
    expect(documentDisplayName(src, FALLBACK)).toBe('御請求書_得意先小売御中_発行元商事');
  });

  it('invoice: 敬称欠落でも請求先名のみで組む', () => {
    const src = [
      '---',
      'schemaVersion: invoice/v1',
      'recipient:',
      '  name: 得意先小売',
      'issuer:',
      '  name: 発行元商事',
      '---',
    ].join('\n');
    expect(documentDisplayName(src, FALLBACK)).toBe('御請求書_得意先小売_発行元商事');
  });

  it('invoice: 請求先・発行元の名前が全く無ければファイル名へ', () => {
    const src = ['---', 'schemaVersion: invoice/v1', 'invoiceNumber: INV-1', '---'].join('\n');
    expect(documentDisplayName(src, FALLBACK)).toBe(FALLBACK);
  });

  it('invoice: 日本語キー（発行元 / 敬称 / 発行日）でも組める', () => {
    const src = [
      '---',
      'schemaVersion: invoice/v1',
      '発行日: "2026-07-01"',
      '発行元:',
      '  name: 和名発行元',
      'recipient:',
      '  name: 和名得意先',
      '  敬称: 様',
      '---',
    ].join('\n');
    expect(documentDisplayName(src, FALLBACK)).toBe('御請求書_和名得意先様_和名発行元_20260701');
  });

  it('test-spec md: タイトルを表示名にする', () => {
    const src = [
      '---',
      'スキーマ: test-spec/v1',
      '文書番号: TEST-2026-0002',
      'タイトル: 受発注ワークフロー 検証シート',
      '---',
    ].join('\n');
    expect(documentDisplayName(src, FALLBACK)).toBe('受発注ワークフロー 検証シート');
  });

  it('spec md: タイトルを表示名にする', () => {
    const src = ['---', 'スキーマ: spec/v1', 'タイトル: EC サイト 基本設計書', '---'].join('\n');
    expect(documentDisplayName(src, FALLBACK)).toBe('EC サイト 基本設計書');
  });

  it('TSV 検証シート: メタ タイトルを表示名にする', () => {
    const src = [
      '#! md-business:test-spec-tsv/v1',
      '# タイトル: 受発注ワークフロー 検証シート',
      'No.:number\t項目',
      '1\tサンプル',
    ].join('\n');
    expect(documentDisplayName(src, 'standard-ja.tsv')).toBe('受発注ワークフロー 検証シート');
  });

  it('TSV: タイトルメタが無ければファイル名へ', () => {
    const src = ['#! md-business:test-spec-tsv/v1', 'No.:number\t項目', '1\tサンプル'].join('\n');
    expect(documentDisplayName(src, 'checklist.tsv')).toBe('checklist.tsv');
  });

  it('タイトルも既知スキーマも無い素の md はファイル名へ', () => {
    expect(documentDisplayName('# 見出しだけ\n本文', FALLBACK)).toBe(FALLBACK);
  });

  it('壊れた YAML でも throw せずファイル名へ', () => {
    const src = ['---', 'title: [壊れた', '  : yaml', '---'].join('\n');
    expect(documentDisplayName(src, FALLBACK)).toBe(FALLBACK);
  });
});
