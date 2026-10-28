import type { CellEdit, GridModel } from './model.js';

/** 拡張 → webview。null はマーカーの無い TSV。 */
export interface GridUpdateMessage {
  type: 'update';
  model: GridModel | null;
}

/** webview → 拡張。読み込みが済んだ合図。 */
export interface GridReadyMessage {
  type: 'ready';
}

/** webview → 拡張。1 セルの書き込み。拡張が今のファイルと照らしてから書く。 */
export interface GridEditMessage {
  type: 'edit';
  edit: CellEdit;
}

export type GridInboundMessage = GridReadyMessage | GridEditMessage;
