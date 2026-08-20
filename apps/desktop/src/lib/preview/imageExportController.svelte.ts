/**
 * 画像書き出しの共有コントローラ。
 *
 * htmlExportController と同じ形（プレビューの描画可否を受け取り、押されたら
 * 書き出し一式を遅延読み込みして Rust へ渡す）。違うのは、押す前に何を撮るかを
 * 選ばせる分の状態（型・倍率・形式）をここが持つこと。
 *
 * 選んだ内容は開いている間だけ覚える。保存すると、別の文書を開いたときに
 * 前の文書向けの寸法で撮ってしまい、出来上がりを見るまで気づけない。
 *
 * 書き出し先は**渡さない**。Rust 側が元の文書の場所から機械的に決める。一括のときだけ
 * 名前を渡すが、それも名前の部分だけで、置き場は元の文書と同じフォルダから動かない。
 */
import { invoke } from '@tauri-apps/api/core';
import { browser } from '$app/environment';
import { workspace } from '$lib/workspace/workspace.svelte';
import { DEFAULT_ORDER, buildShotSpec, describeOutput, type ImageOrder } from './imageExport';
import type { BatchFailureKind } from './batchMessage';
import type { Translate } from './frontmatterMessage';

/** 結果表示が自分で消えるまで。HTML 書き出しと揃える。 */
const NOTICE_MS = 8000;

/** 足りない字を 1 行に並べるときの区切り。 */
const JOIN = '、';

/** 直近の書き出し結果。 */
export type ImageExportResult =
  | { ok: true; kind: 'one'; path: string }
  | { ok: true; kind: 'many'; count: number; stopped: boolean }
  | { ok: false; kind: 'error'; message: string };

/** 撮る中身を組み立てる口（run と runBatch で同じものを使う）。 */
interface Renderer {
  /** 本文から、撮る HTML を組む。組めなければ null。 */
  render: (source: string) => Promise<string | null>;
  /** 表など、開いているフォルダから文字として読む。 */
  readText: (relPath: string) => Promise<string>;
  t: Translate;
}

class ImageExportController {
  /** プレビューが描画済みか（＝撮る中身がある）。 */
  ready = $state<boolean>(false);
  /** 撮影中。二重に走らせない。 */
  busy = $state<boolean>(false);
  /** 直近の結果。しばらくして自分で消える。 */
  result = $state<ImageExportResult | null>(null);
  /** 選んでいる注文（型・倍率・形式）。 */
  order = $state<ImageOrder>({ ...DEFAULT_ORDER });
  /** 選ぶ欄を開いているか。閉じている間は一覧を組まない。 */
  picking = $state<boolean>(false);
  /** 一括の進み具合。撮っていない間は null。 */
  progress = $state<{ done: number; total: number } | null>(null);
  #timer: ReturnType<typeof setTimeout> | null = null;
  #stopping = false;

  /** プレビューの描画可否に追従して更新する（$effect から呼ぶ）。 */
  setReady(value: boolean): void {
    this.ready = value;
  }

  /** 押す前に見せる「実際に出るもの」。 */
  get summary(): string {
    return describeOutput(this.order);
  }

  /** [画像] ボタンの活性条件：プレビュー描画済み・撮影中でない・文書が開いている。 */
  get canExport(): boolean {
    return this.ready && !this.busy && workspace.root !== null && workspace.activePath !== null;
  }

  /** 選ぶ欄の開閉。撮れない状態では開かない（開いても押せる先がない）。 */
  toggle(): void {
    if (!this.picking && !this.canExport) return;
    this.picking = !this.picking;
  }

  /** 選ぶ欄を閉じる（外を押したとき・撮り終えたとき）。 */
  close(): void {
    this.picking = false;
  }

  /** 注文の一部を差し替える。触っていない項目は残す。 */
  choose(patch: Partial<ImageOrder>): void {
    this.order = { ...this.order, ...patch };
  }

  /**
   * 一括を途中で止める。すでに出た分はそのまま残す。
   *
   * 出したものを消して回らないのは、消す側が見分けられないため（同じ名前で元からあった
   * 画像と区別が付かない）。何枚まで出たかを言って終える。
   */
  stop(): void {
    this.#stopping = true;
  }

  /**
   * 撮る中身の組み立て一式を読み込む。
   *
   * [画像] を押さない起動では読まれない。撮影は別に立てた画面で行うので、本文が指す
   * 画像や図を先に埋めておかないと、そこだけ空いた絵が撮れる。
   */
  async #renderer(root: string, relPath: string): Promise<Renderer> {
    const { buildExportHtml } = await import('./htmlExport');
    const { composeExportSource } = await import('./composeSource');
    const { workspaceIo } = await import('./workspaceIo');
    const { chartMessage } = await import('$lib/chart/chartMessage');
    const { CHART_INK } = await import('$lib/chart/chartInk');
    const { t } = await import('$lib/i18n/i18n.svelte');
    const { renderMermaidSvg } = await import('./renderMermaid');
    const io = workspaceIo(root);
    return {
      readText: io.readText,
      t,
      render: async (source) => {
        const composed = await composeExportSource(source, {
          docPath: relPath,
          io,
          describe: (problem) => chartMessage(problem, t),
          mermaid: { theme: 'light', render: renderMermaidSvg },
          ink: CHART_INK.light,
        });
        return buildExportHtml(composed);
      },
    };
  }

  /** 撮る前に、指定された字が手元にあるかを見る。無ければ名前を並べて返す。 */
  async #missingFonts(html: string): Promise<string> {
    const { fontFamilies, styleBlocks, missingFonts, browserFontCheck } = await import(
      './fontGuard'
    );
    return missingFonts(fontFamilies(styleBlocks(html)), browserFontCheck()).join(JOIN);
  }

  /** 選んだ内容で 1 枚撮る。書き出し先は Rust が決めるので、ここでは渡さない。 */
  async run(): Promise<void> {
    if (!this.canExport) return;
    const root = workspace.root;
    const relPath = workspace.activePath;
    if (root === null || relPath === null) return;

    const { render, t } = await this.#renderer(root, relPath);
    const html = await render(workspace.source);
    // canExport を満たしていれば通常ここには来ない（プレビューが出ている＝組める）。
    if (html === null) return;

    const missing = await this.#missingFonts(html);
    if (missing !== '') {
      const { batchDetail } = await import('./batchMessage');
      this.picking = false;
      this.#notify({
        ok: false,
        kind: 'error',
        message: batchDetail({ kind: 'missing-font', raw: missing }, t),
      });
      return;
    }

    const spec = buildShotSpec(this.order);
    this.busy = true;
    this.picking = false;
    try {
      const written = await invoke<string>('export_image', {
        root,
        relPath,
        html,
        spec,
        name: null,
      });
      this.#notify({ ok: true, kind: 'one', path: written });
    } catch (e) {
      // Rust の Err(String) は reject 値として届く（Error とは限らない）。
      this.#fail(e);
    } finally {
      this.busy = false;
    }
  }

  /**
   * 文書が指す表の行ごとに 1 枚ずつ撮る。
   *
   * 断れるものは撮る前に全部断る。100 枚の途中で止まると、どこまで出たかを数え直すことに
   * なるので、指定の欠け・列の欠け・名前の衝突・手元にない字はすべて 0 枚のうちに見る。
   */
  async runBatch(): Promise<void> {
    if (!this.canExport) return;
    const root = workspace.root;
    const relPath = workspace.activePath;
    if (root === null || relPath === null) return;

    const { render, readText, t } = await this.#renderer(root, relPath);
    const { readBatchSpec, buildBatch } = await import('./batchPlan');
    const { resolveRelPath } = await import('$lib/workspace/relPath');
    const { batchMessage } = await import('./batchMessage');
    const refuse = (kind: BatchFailureKind, raw: string): void => {
      this.picking = false;
      this.#notify({ ok: false, kind: 'error', message: batchMessage({ kind, raw }, t) });
    };

    const declared = readBatchSpec(workspace.source);
    if (!declared.ok) {
      refuse(declared.problem.kind, declared.problem.raw);
      return;
    }
    const tablePath = resolveRelPath(relPath, declared.spec.source);
    if (tablePath === null) {
      refuse('bad-path', declared.spec.source);
      return;
    }
    let table: string;
    try {
      table = await readText(tablePath);
    } catch {
      refuse('read-failed', declared.spec.source);
      return;
    }
    const built = buildBatch(workspace.source, declared.spec, table);
    if (!built.ok) {
      refuse(built.problem.kind, built.problem.raw);
      return;
    }

    const spec = buildShotSpec(this.order);
    const total = built.items.length;
    this.busy = true;
    this.picking = false;
    this.#stopping = false;
    this.progress = { done: 0, total };
    let done = 0;
    try {
      // 字の確認は 1 枚目を組んでから 1 度だけ。組む前の本文には差し込みが入っていないので、
      // 使う字が出そろわない。
      let checked = false;
      for (const item of built.items) {
        if (this.#stopping) break;
        const html = await render(item.source);
        if (html === null) continue;
        if (!checked) {
          const missing = await this.#missingFonts(html);
          if (missing !== '') {
            refuse('missing-font', missing);
            return;
          }
          checked = true;
        }
        await invoke<string>('export_image', { root, relPath, html, spec, name: item.name });
        done += 1;
        this.progress = { done, total };
      }
      this.#notify({ ok: true, kind: 'many', count: done, stopped: this.#stopping });
    } catch (e) {
      this.#fail(e);
    } finally {
      this.busy = false;
      this.progress = null;
      this.#stopping = false;
    }
  }

  #fail(e: unknown): void {
    this.#notify({ ok: false, kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }

  #notify(result: ImageExportResult): void {
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

/** アプリ全体で 1 つの共有画像書き出しコントローラ。 */
export const imageExport = new ImageExportController();
