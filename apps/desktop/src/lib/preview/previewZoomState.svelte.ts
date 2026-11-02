/**
 * プレビューの表示倍率の共有状態。
 *
 * 倍率を変える口は 3 つある（ヘッダのボタン・親 window のキー・プレビュー内のキーとホイール）。
 * プレビュー内の操作は postMessage で +layout に届くので、+page だけに状態を持たせると
 * そこから触れない。PDF 出力と同じく、ここを挟んで両方から読み書きする。
 */
import type { ZoomAction } from '$lib/layout/shortcuts';
import {
  DEFAULT_ZOOM,
  PREVIEW_ZOOM_STORAGE_KEY,
  parseStoredZoom,
  zoomIn,
  zoomOut,
} from './previewZoom';

function readStored(): number {
  try {
    return parseStoredZoom(localStorage.getItem(PREVIEW_ZOOM_STORAGE_KEY));
  } catch {
    return DEFAULT_ZOOM;
  }
}

class PreviewZoomState {
  value = $state<number>(readStored());

  apply(action: ZoomAction): void {
    const next =
      action === 'zoomIn' ? zoomIn(this.value) : action === 'zoomOut' ? zoomOut(this.value) : DEFAULT_ZOOM;
    if (next === this.value) return;
    this.value = next;
    try {
      localStorage.setItem(PREVIEW_ZOOM_STORAGE_KEY, String(next));
    } catch {
      // 保存できない環境でも、このセッションの表示は変わる
    }
  }
}

export const previewZoom = new PreviewZoomState();
