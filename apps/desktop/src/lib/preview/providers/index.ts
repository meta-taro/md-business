/**
 * デスクトップ・プレビューの provider レジストリ（データ駆動 4 スキーマ）。
 *
 * 登録順は chrome-extension の createDefaultRegistry と揃える（invoice → db-spec
 * → nosql-db-spec → api-spec）。マーカーは互いに素なので検出衝突は無いが、
 * 将来 prose スキーマ（spec は documentNumber / reviewers を広く主張する）を
 * Phase 2c で足す際は「より厳格なマーカーを先」の原則を守る。
 */
import type { PreviewProvider } from '../previewFactory';
import { invoiceProvider } from './invoice';
import { dbSpecProvider } from './dbSpec';
import { nosqlDbSpecProvider } from './nosqlDbSpec';
import { apiSpecProvider } from './apiSpec';

export const PROVIDERS: readonly PreviewProvider[] = [
  invoiceProvider,
  dbSpecProvider,
  nosqlDbSpecProvider,
  apiSpecProvider,
];
