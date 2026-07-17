import { describe, it, expect } from 'vitest';
import { resolveProvider, type PreviewProviderMeta } from './registry';

// chrome-extension createDefaultRegistry と同じ登録順・同じマーカー（データ駆動
// 4 スキーマのみ）。順序が結果に効くケース（first-registered-wins）を検証する
// ため、実 provider と同じ順に並べた最小 fixture を使う。
const PROVIDERS: readonly PreviewProviderMeta[] = [
  { id: 'invoice', label: '請求書', markers: ['invoiceNumber', '請求書番号', 'items', '品目', 'issuer', '発行元'] },
  { id: 'db-spec', label: 'DB 設計書', markers: ['tables', 'テーブル'] },
  { id: 'nosql-db-spec', label: 'NoSQL 設計書', markers: ['collections', 'コレクション'] },
  { id: 'api-spec', label: 'API 設計書', markers: ['endpoints', 'エンドポイント'] },
];

describe('resolveProvider', () => {
  it('schema フィールドの直接一致で解決する', () => {
    const p = resolveProvider({ schema: 'invoice' }, PROVIDERS);
    expect(p?.id).toBe('invoice');
  });

  it('schema フィールドの prefix 一致で解決する（api-spec/v1 → api-spec）', () => {
    const p = resolveProvider({ schema: 'api-spec/v1' }, PROVIDERS);
    expect(p?.id).toBe('api-spec');
  });

  it('schemaVersion の prefix 一致で解決する（db-spec/v1 → db-spec）', () => {
    const p = resolveProvider({ schemaVersion: 'db-spec/v1' }, PROVIDERS);
    expect(p?.id).toBe('db-spec');
  });

  it('マーカー（英語キー）で invoice を検出する', () => {
    const p = resolveProvider({ invoiceNumber: 'INV-001' }, PROVIDERS);
    expect(p?.id).toBe('invoice');
  });

  it('マーカー（日本語キー）で invoice を検出する', () => {
    const p = resolveProvider({ 請求書番号: 'INV-001' }, PROVIDERS);
    expect(p?.id).toBe('invoice');
  });

  it('マーカーで api-spec を検出する（endpoints）', () => {
    const p = resolveProvider({ endpoints: [] }, PROVIDERS);
    expect(p?.id).toBe('api-spec');
  });

  it('マーカーで db-spec を検出する（tables）', () => {
    const p = resolveProvider({ tables: [] }, PROVIDERS);
    expect(p?.id).toBe('db-spec');
  });

  it('マーカーで nosql-db-spec を検出する（collections）', () => {
    const p = resolveProvider({ collections: [] }, PROVIDERS);
    expect(p?.id).toBe('nosql-db-spec');
  });

  it('複数マーカーが該当する場合は登録順で先勝ち（invoice が api-spec より先）', () => {
    const p = resolveProvider({ invoiceNumber: 'x', endpoints: [] }, PROVIDERS);
    expect(p?.id).toBe('invoice');
  });

  it('schema の明示指定はマーカーより優先する', () => {
    // frontmatter に endpoints があるが schema: invoice が明示されている
    const p = resolveProvider({ schema: 'invoice', endpoints: [] }, PROVIDERS);
    expect(p?.id).toBe('invoice');
  });

  it('schema が非文字列なら無視してマーカーへフォールバックする', () => {
    const p = resolveProvider({ schema: 123, tables: [] }, PROVIDERS);
    expect(p?.id).toBe('db-spec');
  });

  it('未知の schema かつマーカー無しなら undefined', () => {
    const p = resolveProvider({ schema: 'unknown/v9', foo: 'bar' }, PROVIDERS);
    expect(p).toBeUndefined();
  });

  it('空 frontmatter は undefined', () => {
    const p = resolveProvider({}, PROVIDERS);
    expect(p).toBeUndefined();
  });
});
