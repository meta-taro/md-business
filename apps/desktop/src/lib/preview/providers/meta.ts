/**
 * 7 スキーマの見分け情報（ID / 表示名 / 検出マーカー）だけを集めたもの。
 *
 * 描画一式（検証器・renderer・文書 CSS）を一切 import しない。ここが軽いままである
 * ことに意味がある：どのスキーマかを決めるまでは、どのスキーマの中身も要らない。
 * 実際の provider はここのメタを受け取って組み立て、必要になってから読み込まれる
 * （providers/lazy.ts）。
 *
 * 登録順は chrome-extension の createDefaultRegistry と揃える:
 *   invoice → test-spec → db-spec → nosql-db-spec → api-spec → investigation → spec
 * spec を最後に置くのは、そのマーカー（documentNumber / 文書番号 / chapters /
 * reviewers）が最も広く、他スキーマの取りこぼしを拾う受け皿になるため。
 * test-spec は列定義 / Sheets 連携という厳格なマーカーを持つので invoice の直後・
 * spec より前に置き、reviewers を共有する spec に誤ルートされないようにする。
 * investigation も documentNumber / reviewers を持つので spec より前に置く。
 */
import type { PreviewProviderMeta } from '../registry';

export const INVOICE_META: PreviewProviderMeta = {
  id: 'invoice',
  label: '請求書',
  markers: [
    'invoiceNumber',
    '請求書番号',
    '見積書番号',
    '領収書番号',
    'items',
    '品目',
    'issuer',
    '発行元',
  ],
};

export const TEST_SPEC_META: PreviewProviderMeta = {
  id: 'test-spec',
  label: '検証シート',
  markers: [
    'columns',
    '列',
    '列定義',
    '検証項目列',
    'googleSheetId',
    'sheetId',
    'SheetId',
    'シートID',
    '連携シートID',
  ],
};

export const DB_SPEC_META: PreviewProviderMeta = {
  id: 'db-spec',
  label: 'DB 設計書',
  markers: ['tables', 'テーブル'],
};

export const NOSQL_DB_SPEC_META: PreviewProviderMeta = {
  id: 'nosql-db-spec',
  label: 'NoSQL 設計書',
  markers: ['collections', 'コレクション'],
};

export const API_SPEC_META: PreviewProviderMeta = {
  id: 'api-spec',
  label: 'API 設計書',
  markers: ['endpoints', 'エンドポイント'],
};

export const INVESTIGATION_META: PreviewProviderMeta = {
  id: 'investigation',
  label: '調査報告書',
  // 所見 / 対象ファイル / 使用ツールは他スキーマが主張しないキー。spec の広い
  // マーカー（文書番号 / レビュアー）に取られないよう spec より前に登録する。
  markers: ['findings', '所見', 'targets', '対象ファイル', 'tools', '使用ツール'],
};

export const SPEC_META: PreviewProviderMeta = {
  id: 'spec',
  label: '基本設計書',
  // spec のマーカーは広い（documentNumber / reviewers は test-spec 以外も主張し得る）。
  // registry の登録順で最後に置き、より厳格なスキーマ（test-spec 等）を先に判定させる。
  markers: ['documentNumber', '文書番号', 'chapters', '章ファイル', 'reviewers', 'レビュアー'],
};

/** 検出の優先順（先勝ち）。 */
export const PROVIDER_METAS: readonly PreviewProviderMeta[] = [
  INVOICE_META,
  TEST_SPEC_META,
  DB_SPEC_META,
  NOSQL_DB_SPEC_META,
  API_SPEC_META,
  INVESTIGATION_META,
  SPEC_META,
];
