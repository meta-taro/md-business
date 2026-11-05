/**
 * PDF 出力の共有コントローラ（DESIGN §6.4）。
 *
 * Top bar の [PDF] ボタン（TopBar.svelte）と、実体のプレビュー iframe（+page.svelte）は
 * 別コンポーネントで直接参照できない。themeController / workspace と同じく本シングルトンを
 * 挟み、プレビュー側が「印刷関数」と「印刷する中身」を登録 → Top bar 側がそれを叩く。
 *
 * Windows では、プレビューの srcdoc（renderer-pdf の @page CSS を内包）を Rust へ渡し、
 * 裏で立てた WebView2 に PDF を作らせて元の文書の隣へ置く。印刷の画面から保存した PDF には
 * 見出しのしおりが付かないため。書き出し先は HTML・画像と同じく**渡さない**。
 *
 * それ以外の OS では、これまでどおりプレビュー iframe を印刷する（→「PDF として保存」）。
 */
import { invoke } from '@tauri-apps/api/core';
import { browser } from '$app/environment';
import { workspace } from '$lib/workspace/workspace.svelte';
import { canPrintDirectly } from './printTitle';

/** 結果表示が自分で消えるまで。HTML 書き出しと揃える。 */
const NOTICE_MS = 8000;

/** 直近の書き出し結果。成功なら書き出し先、失敗なら理由。 */
export type PdfExportResult = { ok: true; path: string } | { ok: false; message: string };

/** 印刷する中身。`name` は frontmatter の fileName から組んだ保存名（無ければ null）。 */
export interface PdfSource {
  html: string;
  name: string | null;
}

/** プレビューホスト（+page）が登録するもの。 */
export interface PdfHost {
  /** 印刷の画面を開く（iframe.contentWindow.print 等）。 */
  print: () => void | Promise<void>;
  /** 今プレビューに出ている中身。出ていなければ null。 */
  source: () => PdfSource | null;
}

class PdfExportController {
  /** 現在プレビューが印刷可能（schema / Markdown ビューワーが描画済み）か。 */
  ready = $state<boolean>(false);
  /** PDF を作っている最中。二重に走らせない。 */
  busy = $state<boolean>(false);
  /** 直近の結果。しばらくして自分で消える。 */
  result = $state<PdfExportResult | null>(null);
  #host: PdfHost | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** プレビューホスト（+page）が onMount で登録する。 */
  register(host: PdfHost): void {
    this.#host = host;
  }

  /** ホスト破棄時に解除し、古い iframe への参照を残さない。 */
  unregister(): void {
    this.#host = null;
    this.ready = false;
  }

  /** プレビューの描画可否に追従して更新する（$effect から呼ぶ）。 */
  setReady(value: boolean): void {
    this.ready = value;
  }

  /** [PDF] ボタンの活性条件：ホストが登録済み・プレビュー描画済み・作成中でない。 */
  get canExport(): boolean {
    return this.ready && !this.busy && this.#host !== null;
  }

  /** Top bar の [PDF] / Ctrl+P から呼ぶ。作れる環境なら直接作り、無理なら印刷の画面を開く。 */
  async run(): Promise<void> {
    if (!this.canExport) return;
    const host = this.#host;
    const root = workspace.root;
    const relPath = workspace.activePath;
    const direct = browser && canPrintDirectly(navigator.userAgent);
    const source = host?.source() ?? null;
    if (!direct || root === null || relPath === null || source === null) {
      await this.print();
      return;
    }

    this.busy = true;
    let failed = false;
    try {
      const written = await invoke<string>('export_pdf', {
        root,
        relPath,
        html: source.html,
        name: source.name,
      });
      this.#notify({ ok: true, path: written });
    } catch (e) {
      // Rust の Err(String) は reject 値として届く（Error とは限らない）。
      this.#notify({ ok: false, message: e instanceof Error ? e.message : String(e) });
      failed = true;
    } finally {
      this.busy = false;
    }
    // 裏で作れない環境でも、印刷の画面からなら保存できる。理由を出したうえで開く。
    if (failed) await this.print();
  }

  /** 印刷の画面を開く。外から「印刷して」と頼まれたときは、こちらを使う。 */
  async print(): Promise<void> {
    if (this.canExport) await this.#host?.print();
  }

  #notify(result: PdfExportResult): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    this.result = result;
    if (!browser) return;
    this.#timer = setTimeout(() => {
      this.result = null;
      this.#timer = null;
    }, NOTICE_MS);
  }
}

/** アプリ全体で 1 つの共有 PDF 出力コントローラ。 */
export const pdfExport = new PdfExportController();
