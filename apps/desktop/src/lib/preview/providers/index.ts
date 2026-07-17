/**
 * デスクトップ・プレビューの provider レジストリ（6 スキーマ全対応）。
 *
 * 登録順は chrome-extension の createDefaultRegistry と揃える:
 *   invoice → test-spec → db-spec → nosql-db-spec → api-spec → spec
 * spec を最後に置くのは、そのマーカー（documentNumber / 文書番号 / chapters /
 * reviewers）が最も広く、他スキーマの取りこぼしを拾う受け皿になるため。
 * test-spec は列定義 / Sheets 連携という厳格なマーカーを持つので invoice の直後・
 * spec より前に置き、reviewers を共有する spec に誤ルートされないようにする。
 */
import type { PreviewProvider } from '../previewFactory';
import { invoiceProvider } from './invoice';
import { testSpecProvider } from './testSpec';
import { dbSpecProvider } from './dbSpec';
import { nosqlDbSpecProvider } from './nosqlDbSpec';
import { apiSpecProvider } from './apiSpec';
import { specProvider } from './spec';

export const PROVIDERS: readonly PreviewProvider[] = [
  invoiceProvider,
  testSpecProvider,
  dbSpecProvider,
  nosqlDbSpecProvider,
  apiSpecProvider,
  specProvider,
];
