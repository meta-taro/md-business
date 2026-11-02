/**
 * キーボードショートカットの意味解決（純ロジック・vitest 単体テスト用）。
 *
 * onKeydown ハンドラ（+layout.svelte）に修飾キー判定を直書きすると単体テストできず、
 * Ctrl / Cmd（Win/Linux ⇔ Mac）や Alt/Shift 誤爆の分岐が検証されないまま増える。
 * ここでは「どのキー組み合わせがどのアクションか」だけを純関数に切り出す。
 * 実際の副作用（save / print）は呼び出し側が action で分岐する。
 */

/** ショートカットで起動できるアクション。 */
export type ShortcutAction = 'save' | 'pdf' | 'find';

/** プレビューの表示倍率を変えるアクション。 */
export type ZoomAction = 'zoomIn' | 'zoomOut' | 'zoomReset';

/** matchShortcut が見るキーイベントの最小形（KeyboardEvent 互換）。 */
export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * 修飾キー + 文字から対応アクションを解決する。該当なしは null。
 * primary 修飾は Ctrl（Win/Linux）/ Cmd（Mac）どちらでも同じに扱う。
 * Alt / Shift 併用は別ショートカット（例: Ctrl+Shift+S）とみなし弾く。
 */
export function matchShortcut(event: ShortcutEvent): ShortcutAction | null {
  const primary = event.ctrlKey || event.metaKey;
  if (!primary || event.altKey || event.shiftKey) return null;
  switch (event.key.toLowerCase()) {
    case 's':
      return 'save';
    case 'p':
      return 'pdf';
    case 'f':
      return 'find';
    default:
      return null;
  }
}

/**
 * 表示倍率のキー。Ctrl / Cmd と組み合わせる。
 *
 * 拡大の `+` は配列によって Shift が要る（US は Shift+=、日本語配列は Shift+;）。
 * Shift 付きでも当てないと、日本語配列では拡大が押せない。`=` と `;` は Shift 無しの同じキー。
 */
export function matchZoomShortcut(event: ShortcutEvent): ZoomAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  switch (event.key) {
    case '=':
    case '+':
    case ';':
      return 'zoomIn';
    case '-':
      return event.shiftKey ? null : 'zoomOut';
    case '0':
      return event.shiftKey ? null : 'zoomReset';
    default:
      return null;
  }
}

/**
 * プレビュー iframe → 親 window への postMessage プロトコル識別子。
 * iframe にフォーカスがある時の keydown は親へ伝播しないため、iframe 側で横取りした
 * ショートカット（保存）をこのメッセージで親へ委譲する（previewDocument.ts が発信元）。
 * 他フレーム・拡張機能の無関係なメッセージを弾くための固定 source 文字列。
 */
export const PREVIEW_MESSAGE_SOURCE = 'md-business-preview';

/**
 * プレビュー iframe から届いた message イベントの data を検証し、対応アクションへ解決する。
 * source が一致しない／未知の action は null（親側は無視する）。信頼できない postMessage
 * を受け取る口なので、object 形状と source を厳格に確認してから action を通す。
 */
export function resolvePreviewMessage(data: unknown): ShortcutAction | ZoomAction | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as { source?: unknown; action?: unknown };
  if (message.source !== PREVIEW_MESSAGE_SOURCE) return null;
  if (message.action === 'save') return 'save';
  if (message.action === 'pdf') return 'pdf';
  if (message.action === 'find') return 'find';
  if (message.action === 'zoomIn' || message.action === 'zoomOut' || message.action === 'zoomReset') {
    return message.action;
  }
  return null;
}
