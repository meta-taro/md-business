/** 拡張 → webview。 */
export interface UpdateMessage {
  type: 'update';
  text: string;
}

/** webview → 拡張。読み込みが済んだ合図。これより前に送った文書は取りこぼされる。 */
export interface ReadyMessage {
  type: 'ready';
}
