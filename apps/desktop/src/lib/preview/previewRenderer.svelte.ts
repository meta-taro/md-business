/**
 * プレビュー描画の遅延読み込み。
 *
 * 文書を描くには 6 スキーマぶんの検証器・文書 CSS・Markdown の組み立てが要る。
 * これが起動時に読む JS の大半を占める一方、窓を出すまでに要るものは 1 つも無い。
 * 描画側の入口をここへ閉じ込め、プレビューを実際に出す時点で読み込む。
 *
 * 読み込みが済むまで `render` は null で、呼ぶ側はまだ描けない状態として扱う。
 * 失敗したら要求済みの印を戻し、次にプレビューを出そうとしたときにもう一度試す
 * （読むのは同梱ファイルなので、通信のように後で回復する類の失敗ではない）。
 */
import type { PreviewResult, RenderPreviewOptions } from './previewFactory';

export type RenderPreview = (source: string, options?: RenderPreviewOptions) => PreviewResult;

class PreviewRenderer {
  #render = $state<RenderPreview | null>(null);
  #requested = false;

  /** 読み込み済みなら描画関数、まだなら null。 */
  get render(): RenderPreview | null {
    return this.#render;
  }

  /** プレビューを出す用があるときに呼ぶ。二重に読まない。 */
  load(): void {
    if (this.#requested || this.#render !== null) return;
    this.#requested = true;
    void import('./renderPreview')
      .then((module) => {
        this.#render = module.renderPreview;
      })
      .catch(() => {
        this.#requested = false;
      });
  }
}

/** アプリ全体で 1 つ。描画関数は一度読めば使い回す。 */
export const previewRenderer = new PreviewRenderer();
