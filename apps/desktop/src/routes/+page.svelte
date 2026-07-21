<script lang="ts">
  import { untrack } from 'svelte';
  import { themeController } from '$lib/theme.svelte';
  import { renderPreview } from '$lib/preview/renderPreview';
  import CodeMirrorEditor from '$lib/editor/CodeMirrorEditor.svelte';
  import { debounce } from '$lib/util/debounce';
  import { parseTsv, serializeTsv, type TsvDocument } from '@md-business/schema-test-spec-tsv';
  import { isTsvSource } from '$lib/tsv/detect';
  import TsvGrid from '$lib/tsv/TsvGrid.svelte';
  import { browser } from '$app/environment';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import {
    DEFAULT_SPLIT_RATIO,
    ratioFromPointer,
    parseStoredRatio,
    stepRatio,
  } from '$lib/layout/splitRatio';

  // 中央 = 左右 2 分割（DESIGN §6）。左＝Markdown エディター（CodeMirror 6）、
  // 右＝ビューワー（renderer-pdf の HTML を iframe 隔離）。
  //
  // source は共有 workspace ストアが唯一の真実（§2.1）。左レールで開いたファイルも、
  // ここでの編集も同じ source を指す。ファイル未オープン時は seed テンプレ。
  const source = $derived(workspace.source);
  // debounce 後の値。プレビューはこちらから描画し、タイプ中の再描画連打を抑える。
  let debouncedSource = $state(workspace.source);

  // §6.2 既定 200ms。最後の入力から 200ms 静止で 1 回だけプレビューへ反映。
  const pushToPreview = debounce((value: string) => {
    debouncedSource = value;
  }, 200);

  // ファイルを開いた瞬間（loadSeq 変化）はプレビューへ即反映する。source を untrack して
  // 依存を loadSeq だけに絞り、タイプ中の debounce を壊さない。
  $effect(() => {
    workspace.loadSeq;
    debouncedSource = untrack(() => workspace.source);
  });

  function handleEditorChange(value: string): void {
    workspace.setSource(value);
    pushToPreview(value);
  }

  // frontmatter を registry で振り分け、該当スキーマのビューワーで描画する（6 スキーマ
  // 自動判定・Phase 2b）。テーマ変更に追従して iframe 内 <html data-theme> も一致させる
  // （別ドキュメントなのでアプリの data-theme は継承されない）。debouncedSource / theme の
  // 変化で即再描画。
  const preview = $derived(
    renderPreview(debouncedSource, { theme: themeController.value }),
  );

  // カスタム TSV 検証シートは読み取りプレビューでなく編集グリッド（本命 UI・Issue 010）で開く。
  // 先頭マジック行で判定し、TSV なら parseTsv した doc をグリッドへ渡す。
  const isTsv = $derived(isTsvSource(debouncedSource));
  const tsvDoc = $derived(isTsv ? parseTsv(debouncedSource) : null);

  // グリッド編集 → serializeTsv で source（＝正本）へ書き戻し、エディターと即同期する。
  // debouncedSource も即更新して doc を再導出し、グリッドを遅延なく反映する。
  function handleGridChange(next: TsvDocument): void {
    const text = serializeTsv(next);
    workspace.setSource(text);
    debouncedSource = text;
  }

  // ── 中央ディバイダ（左右幅比のドラッグ調整 + 50/50 リセット・DESIGN §6）──
  // 左ペイン占有率 0〜1。localStorage から復元し、変更のたびに永続化する。
  const SPLIT_STORAGE_KEY = 'md-business:desktop:split-ratio';
  const DIVIDER_W = 6; // px。CSS の .divider 幅と一致させる。
  const KEY_STEP_PX = 24; // 矢印キー 1 回の移動量（px 相当）。

  let splitRatio = $state(
    browser ? parseStoredRatio(localStorage.getItem(SPLIT_STORAGE_KEY)) : DEFAULT_SPLIT_RATIO,
  );
  let splitEl = $state<HTMLDivElement>();
  let dragging = $state(false);

  // grid-template-columns 文字列。カスタムプロパティ経由で渡し、狭幅時は
  // メディアクエリ側の縦積みで上書きできるようにする（インライン直書きしない）。
  function dividerColumns(ratio: number): string {
    return `${ratio}fr ${DIVIDER_W}px ${1 - ratio}fr`;
  }

  function persistRatio(): void {
    if (browser) localStorage.setItem(SPLIT_STORAGE_KEY, String(splitRatio));
  }

  function startDrag(event: PointerEvent): void {
    if (!splitEl) return;
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onDrag(event: PointerEvent): void {
    if (!dragging || !splitEl) return;
    const rect = splitEl.getBoundingClientRect();
    splitRatio = ratioFromPointer(event.clientX, rect.left, rect.width);
  }

  function endDrag(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    const el = event.currentTarget as HTMLElement;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    persistRatio();
  }

  function resetSplit(): void {
    splitRatio = DEFAULT_SPLIT_RATIO;
    persistRatio();
  }

  function onDividerKey(event: KeyboardEvent): void {
    if (!splitEl) return;
    const width = splitEl.getBoundingClientRect().width;
    switch (event.key) {
      case 'ArrowLeft':
        splitRatio = stepRatio(splitRatio, -1, width, KEY_STEP_PX);
        break;
      case 'ArrowRight':
        splitRatio = stepRatio(splitRatio, 1, width, KEY_STEP_PX);
        break;
      case 'Home':
      case 'Enter':
        resetSplit();
        break;
      default:
        return;
    }
    persistRatio();
    event.preventDefault();
  }
</script>

<div
  class="split"
  class:dragging
  bind:this={splitEl}
  style="--split-cols: {dividerColumns(splitRatio)}"
>
  <section class="pane editor" aria-label="Markdown エディター">
    <div class="pane-head">エディター — Markdown</div>
    <CodeMirrorEditor value={source} onChange={handleEditorChange} />
  </section>

  <!-- ドラッグで幅調整・ダブルクリック / Home / Enter で 50/50・矢印キーで微調整 -->
  <!-- WAI-ARIA "Window Splitter" は role="separator" + tabindex + キーボード操作が正規の
       対話パターン。svelte-check は separator を非対話と見なすため、当該2規則のみ抑制する。 -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="divider"
    role="separator"
    aria-orientation="vertical"
    aria-label="エディターとプレビューの幅を調整（ダブルクリックで 50/50 に戻す）"
    aria-valuenow={Math.round(splitRatio * 100)}
    aria-valuemin={0}
    aria-valuemax={100}
    tabindex="0"
    onpointerdown={startDrag}
    onpointermove={onDrag}
    onpointerup={endDrag}
    ondblclick={resetSplit}
    onkeydown={onDividerKey}
  ></div>

  <section class="pane preview" aria-label="ビューワー（プレビュー）">
    {#if isTsv && tsvDoc}
      <div class="pane-head">検証シート — グリッド編集</div>
      <div class="grid-wrap">
        <TsvGrid doc={tsvDoc} onChange={handleGridChange} />
      </div>
    {:else}
    <div class="pane-head">プレビュー{#if preview.ok} — {preview.label}{/if}</div>
    {#if preview.ok}
      <iframe class="viewer" srcdoc={preview.srcdoc} title="{preview.label}プレビュー"></iframe>
      {#if preview.errors.length > 0 || preview.warnings.length > 0}
        <div class="notices" role="status">
          {#each preview.errors as err (err)}
            <span class="notice err">{err}</span>
          {/each}
          {#each preview.warnings as warn (warn)}
            <span class="notice warn">{warn}</span>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="pane-empty">
        <p class="hint">{preview.reason}</p>
        <span class="env">frontmatter（--- で囲む先頭ブロック）の書式を確認してください</span>
      </div>
    {/if}
    {/if}
  </section>
</div>

<style>
  .split {
    height: 100%;
    display: grid;
    /* 比率はインラインの --split-cols で駆動。未設定時（SSR 初期）は 50/50 相当。 */
    grid-template-columns: var(--split-cols, 1fr 6px 1fr);
    min-height: 0;
  }

  /* ドラッグ中は iframe がポインタを奪わないよう無効化し、全体を col-resize に。 */
  .split.dragging {
    cursor: col-resize;
    user-select: none;
  }

  .split.dragging .viewer {
    pointer-events: none;
  }

  .pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* 中央ディバイダ。6px の実体 + 疑似要素で当たり判定を左右に広げる。 */
  .divider {
    position: relative;
    background: var(--border);
    cursor: col-resize;
    touch-action: none; /* タッチのスクロール発火を止めドラッグ専有 */
    transition: background 120ms ease;
  }

  .divider::before {
    content: '';
    position: absolute;
    inset: 0 -4px; /* 上下いっぱい・左右 +4px の掴みしろ */
  }

  .divider:hover,
  .divider:focus-visible {
    background: var(--accent);
    outline: none;
  }

  .pane-head {
    height: 34px;
    display: flex;
    align-items: center;
    padding: 0 var(--space-4);
    flex: none;
    font-size: var(--text-2xs-size);
    font-weight: var(--text-2xs-weight);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    border-bottom: 1px solid var(--border);
  }

  .pane-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-6);
    text-align: center;
  }

  .viewer {
    flex: 1;
    min-height: 0;
    width: 100%;
    border: none;
    background: var(--bg-app);
  }

  /* TSV グリッド編集の器。TsvGrid は height:100% で内部スクロールするため高さを与える。 */
  .grid-wrap {
    flex: 1;
    min-height: 0;
  }

  .notices {
    flex: none;
    max-height: 30%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--border);
    background: var(--bg-subtle);
  }

  .notice {
    font-size: var(--text-2xs-size);
    line-height: 1.5;
  }

  .notice.err {
    color: var(--danger-fg);
  }

  .notice.warn {
    color: var(--warning-fg, var(--text-secondary));
  }

  .hint {
    margin: 0;
    font-size: var(--text-sm-size);
    line-height: 1.7;
    color: var(--text-tertiary);
  }

  .env {
    font-size: var(--text-xs-size);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    background: var(--accent-subtle);
    color: var(--accent);
  }

  /* < 768px: 左右分割をやめ縦積み（DESIGN §7.1・簡易対応。タブ切替は後続）。
     縦積みでは横幅ドラッグが無意味なのでディバイダを隠し、比率も無効化する。 */
  @media (max-width: 767px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 1fr 1fr;
    }

    .divider {
      display: none;
    }

    .pane.editor {
      border-bottom: 1px solid var(--border);
    }
  }
</style>
