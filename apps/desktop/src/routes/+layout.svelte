<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { browser } from '$app/environment';
  import { themeController } from '$lib/theme.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { pdfExport } from '$lib/preview/pdfExport.svelte';
  import {
    matchShortcut,
    resolvePreviewMessage,
    type ShortcutAction,
  } from '$lib/layout/shortcuts';
  import TopBar from '$lib/components/TopBar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import FileTree from '$lib/components/FileTree.svelte';
  import SidePanel from '$lib/components/SidePanel.svelte';
  import {
    DEFAULT_FILETREE_W,
    MIN_FILETREE_W,
    MAX_FILETREE_W,
    widthFromPointer,
    parseStoredWidth,
    stepWidth,
  } from '$lib/layout/railWidth';

  // Svelte 5 runes: 子ルート（+page）はエディター↔プレビュー分割を描画する。
  let { children } = $props();

  // Git / AI / MCP パネルは既定で畳む（DESIGN §6・エディター↔プレビューを広く）。
  let panelOpen = $state(false);

  // ── 左レール（エクスプローラー）の幅リサイズ + 折り畳み（右 SidePanel と対称）──
  // 幅は絶対 px（railWidth.ts の純ロジックでクランプ）。開いた幅と畳み状態を localStorage に永続化。
  const EXPLORER_W_KEY = 'md-business:desktop:explorer-width';
  const EXPLORER_COLLAPSED_KEY = 'md-business:desktop:explorer-collapsed';
  const RAIL_W = 40; // 折り畳み時のレール幅（SidePanel の 40px と一致）。
  const DIVIDER_W = 6; // px。CSS の .rail-divider 幅と一致させる。
  const KEY_STEP_PX = 24; // 矢印キー 1 回の移動量。

  let explorerWidth = $state(
    browser ? parseStoredWidth(localStorage.getItem(EXPLORER_W_KEY)) : DEFAULT_FILETREE_W,
  );
  let explorerCollapsed = $state(
    browser ? localStorage.getItem(EXPLORER_COLLAPSED_KEY) === '1' : false,
  );
  let bodyEl = $state<HTMLDivElement>();
  let draggingRail = $state(false);

  // grid-template-columns 文字列。左レール | (ディバイダ) | 中央 | 右パネル。
  // 折り畳み時はレール固定幅にしディバイダを畳む。
  function bodyColumns(width: number, collapsed: boolean): string {
    return collapsed
      ? `${RAIL_W}px minmax(0, 1fr) auto`
      : `${width}px ${DIVIDER_W}px minmax(0, 1fr) auto`;
  }

  function persistWidth(): void {
    if (browser) localStorage.setItem(EXPLORER_W_KEY, String(explorerWidth));
  }

  function toggleExplorer(): void {
    explorerCollapsed = !explorerCollapsed;
    if (browser) localStorage.setItem(EXPLORER_COLLAPSED_KEY, explorerCollapsed ? '1' : '0');
  }

  function startRailDrag(event: PointerEvent): void {
    if (!bodyEl) return;
    draggingRail = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onRailDrag(event: PointerEvent): void {
    if (!draggingRail || !bodyEl) return;
    // レール左端（= body 左端）からポインタまでの距離をそのまま幅にする。
    const left = bodyEl.getBoundingClientRect().left;
    explorerWidth = widthFromPointer(event.clientX, left);
  }

  function endRailDrag(event: PointerEvent): void {
    if (!draggingRail) return;
    draggingRail = false;
    const el = event.currentTarget as HTMLElement;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    persistWidth();
  }

  function resetRail(): void {
    explorerWidth = DEFAULT_FILETREE_W;
    persistWidth();
  }

  function onRailKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft':
        explorerWidth = stepWidth(explorerWidth, -1, KEY_STEP_PX);
        break;
      case 'ArrowRight':
        explorerWidth = stepWidth(explorerWidth, 1, KEY_STEP_PX);
        break;
      case 'Home':
      case 'Enter':
        resetRail();
        break;
      default:
        return;
    }
    persistWidth();
    event.preventDefault();
  }

  // ショートカットの実行（発火経路に依らず共通）。
  //  - save（Ctrl/Cmd+S）: 保存可能なときだけ workspace.save()（未オープン/未変更は no-op）
  //  - pdf （Ctrl/Cmd+P）: プレビュー iframe を A4 印刷（アプリ全体でなくプレビューを刷る）
  function runAction(action: ShortcutAction): void {
    if (action === 'save') {
      if (workspace.canSave) void workspace.save();
    } else if (action === 'pdf') {
      if (pdfExport.canExport) pdfExport.run();
    }
  }

  // 親 window にフォーカスがある時のショートカット（Win/Linux は Ctrl・Mac は Cmd で共通）。
  // WebView 既定（ページ保存 / OS 印刷ダイアログ）を抑止して自前の動作へ差し替える。
  function onKeydown(event: KeyboardEvent): void {
    const action = matchShortcut(event);
    if (action === null) return;
    event.preventDefault();
    runAction(action);
  }

  // プレビュー iframe にフォーカスがある時の keydown は親へ伝播しない。iframe 側で横取りした
  // ショートカットは postMessage で届くので、source を検証してから同じ runAction に流す
  // （Ctrl/Cmd+P は iframe 自身で print 済み。ここへ来るのは主に保存）。
  function onMessage(event: MessageEvent): void {
    const action = resolvePreviewMessage(event.data);
    if (action === null) return;
    runAction(action);
  }

  onMount(() => {
    // app.html が paint 前に data-theme を確定済み。ここで反応状態を種づけして
    // トグルボタンの表示を実テーマに一致させる（DESIGN §8）。
    themeController.init();
    // 前回開いていたフォルダがあれば自動で開き直す（毎回の選択を不要にする）。
    void workspace.restoreLastFolder();
  });
</script>

<svelte:window onkeydown={onKeydown} onmessage={onMessage} />

<div class="shell">
  <TopBar />

  <div
    class="body"
    class:dragging={draggingRail}
    bind:this={bodyEl}
    style="--body-cols: {bodyColumns(explorerWidth, explorerCollapsed)}"
  >
    <FileTree collapsed={explorerCollapsed} ontoggle={toggleExplorer} />

    {#if !explorerCollapsed}
      <!-- 左レールの幅ドラッグ・ダブルクリックで初期幅・矢印キーで微調整（WAI-ARIA Window Splitter）。
           svelte-check は separator を非対話と見なすため当該 2 規則のみ抑制する。 -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="rail-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="エクスプローラーの幅を調整（ダブルクリックで初期幅に戻す）"
        aria-valuenow={Math.round(explorerWidth)}
        aria-valuemin={MIN_FILETREE_W}
        aria-valuemax={MAX_FILETREE_W}
        tabindex="0"
        onpointerdown={startRailDrag}
        onpointermove={onRailDrag}
        onpointerup={endRailDrag}
        ondblclick={resetRail}
        onkeydown={onRailKey}
      ></div>
    {/if}

    <main class="center">
      {@render children()}
    </main>
    <SidePanel open={panelOpen} ontoggle={() => (panelOpen = !panelOpen)} />
  </div>

  <StatusBar />
</div>

<style>
  .shell {
    height: 100vh;
    display: grid;
    grid-template-rows: var(--topbar-h) 1fr var(--statusbar-h);
    background: var(--bg-app);
    color: var(--text-primary);
    overflow: hidden;
  }

  .body {
    display: grid;
    /* 列はインラインの --body-cols で駆動（左レール幅 + 畳み状態）。未設定時は既定レイアウト。 */
    grid-template-columns: var(--body-cols, var(--filetree-w) minmax(0, 1fr) auto);
    min-height: 0;
  }

  /* ドラッグ中は中央 iframe がポインタを奪わないよう無効化し、全体を col-resize に。 */
  .body.dragging {
    cursor: col-resize;
    user-select: none;
  }

  .body.dragging :global(iframe) {
    pointer-events: none;
  }

  /* 左レールの幅ディバイダ。6px の実体 + 疑似要素で当たり判定を左右に広げる（中央分割と同流儀）。 */
  .rail-divider {
    position: relative;
    background: var(--border);
    cursor: col-resize;
    touch-action: none;
    transition: background 120ms ease;
  }

  .rail-divider::before {
    content: '';
    position: absolute;
    inset: 0 -4px;
  }

  .rail-divider:hover,
  .rail-divider:focus-visible {
    background: var(--accent);
    outline: none;
  }

  .center {
    min-width: 0;
    min-height: 0;
    background: var(--bg-app);
    overflow: hidden;
  }
</style>
