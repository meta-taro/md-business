/**
 * PDF 出力の共有コントローラ（DOC-SPEC-DESKTOP-2026-0001 §6.4 / DESIGN §6.4）。
 *
 * Top bar の [PDF] ボタン（TopBar.svelte）と、実体のプレビュー iframe（+page.svelte）は
 * 別コンポーネントで直接参照できない。themeController / workspace と同じく本シングルトンを
 * 挟み、プレビュー側が「印刷関数」を登録 → Top bar 側がそれを叩く。
 *
 * 出力方式は「プレビュー iframe を print-to-PDF」。iframe の srcdoc は renderer-pdf の
 * @page（A4 縦・余白）CSS を内包するため、WebView の印刷（→「PDF として保存」）で
 * 画面プレビューと 1:1 の A4 正本が得られる（新規 crate 非依存・Chrome 拡張と同方式）。
 * 実際の print はネイティブ窓の印刷ダイアログを開くため、ここには副作用を閉じ込め、
 * 呼び出し可否（canExport）だけを反応状態として公開する。
 */
class PdfExportController {
  /** 現在プレビューが印刷可能（schema / Markdown ビューワーが描画済み）か。 */
  ready = $state<boolean>(false);
  /** プレビューホストが登録する印刷関数（iframe.contentWindow.print 等）。 */
  #print: (() => void) | null = null;

  /** プレビューホスト（+page）が onMount で印刷関数を登録する。 */
  register(print: () => void): void {
    this.#print = print;
  }

  /** ホスト破棄時に解除し、古い iframe への参照を残さない。 */
  unregister(): void {
    this.#print = null;
    this.ready = false;
  }

  /** プレビューの描画可否に追従して更新する（$effect から呼ぶ）。 */
  setReady(value: boolean): void {
    this.ready = value;
  }

  /** [PDF] ボタンの活性条件：印刷関数が登録済みかつプレビュー描画済み。 */
  get canExport(): boolean {
    return this.ready && this.#print !== null;
  }

  /** Top bar の [PDF] から呼ぶ。可否を満たすときだけ印刷（→ PDF 保存）を起動する。 */
  run(): void {
    if (this.canExport) this.#print?.();
  }
}

/** アプリ全体で 1 つの共有 PDF 出力コントローラ。 */
export const pdfExport = new PdfExportController();
