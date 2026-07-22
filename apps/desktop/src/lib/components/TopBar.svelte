<script lang="ts">
  import { onMount } from 'svelte';
  import { themeController } from '$lib/theme.svelte';
  import { titlebarController } from '$lib/window/titlebar.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  // フレームレス（decorations:false）のため、この TopBar 自体が OS タイトルバーを兼ねる。
  // ヘッダー地＝ドラッグ領域（data-tauri-drag-region）、右端に自作のウィンドウコントロール。
  // .lead / .center は pointer-events:none で地に貫通させ、どこを掴んでも窓を動かせる。
  // ボタン群（.right 配下）は pointer-events 有効＝クリック可能。
  onMount(() => {
    titlebarController.init();
  });

  // 中央に開いているファイル名（相対パスの末尾）を表示。未オープンは案内文。
  const docName = $derived(
    workspace.activePath === null
      ? '文書を選択してください'
      : (workspace.activePath.split('/').pop() ?? workspace.activePath),
  );
</script>

<header class="topbar" data-tauri-drag-region>
  <div class="lead">
    <span class="brand-dot" aria-hidden="true"></span>
    <span class="brand">md-business</span>
  </div>

  <div class="center">
    {#if workspace.dirty}
      <!-- 未保存の印（VSCode 風の白丸）。data-tauri-drag-region 内なので装飾のみ。 -->
      <span class="dirty-dot" title="未保存の変更があります" aria-label="未保存"></span>
    {/if}
    <span class="doc-title" class:is-dirty={workspace.dirty}>{docName}</span>
  </div>

  <div class="right">
    <div class="actions">
      <!-- 保存（Ctrl+S と等価）。未オープン / 未変更 / 保存中は不活性。
           PDF 出力 / コマンドパレット（Ctrl K）/ 設定は各実装フェーズで復活させる。 -->
      <button
        class="btn ghost"
        type="button"
        onclick={() => workspace.save()}
        disabled={!workspace.canSave}
        title={workspace.saving ? '保存中…' : '保存（Ctrl+S）'}
        aria-label="保存"
      >
        {workspace.saving ? '保存中…' : '保存'}
      </button>
      <button
        class="btn ghost icon"
        type="button"
        onclick={() => themeController.toggle()}
        title={themeController.value === 'dark' ? 'ライトテーマに切替' : 'ダークテーマに切替'}
        aria-label="テーマ切替"
      >
        {themeController.value === 'dark' ? '☾' : '◐'}
      </button>
    </div>

    <div class="window-controls">
      <button
        class="wc"
        type="button"
        onclick={() => titlebarController.minimize()}
        title="最小化"
        aria-label="最小化"
      >
        ─
      </button>
      <button
        class="wc"
        type="button"
        onclick={() => titlebarController.toggleMaximize()}
        title={titlebarController.maxLabel}
        aria-label={titlebarController.maxLabel}
      >
        {titlebarController.maxGlyph}
      </button>
      <button
        class="wc close"
        type="button"
        onclick={() => titlebarController.close()}
        title="閉じる"
        aria-label="閉じる"
      >
        ✕
      </button>
    </div>
  </div>
</header>

<style>
  .topbar {
    height: var(--topbar-h);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-3);
    /* 右端はウィンドウコントロールを角まで寄せるため padding を持たない */
    padding: 0 0 0 var(--space-4);
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }

  /* 地に貫通させてドラッグ可能に（ボタンは .right 側で pointer-events 有効） */
  .lead,
  .center {
    pointer-events: none;
  }

  .lead {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .brand-dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-full);
    background: var(--accent-gradient);
    flex: none;
  }

  .brand {
    font-size: var(--text-sm-size);
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: var(--tracking-tight);
  }

  .center {
    justify-self: center;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .doc-title {
    font-size: var(--text-sm-size);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .doc-title.is-dirty {
    color: var(--text-primary);
  }

  /* 未保存インジケータ。開いた文書に差分があるときだけ点灯する。 */
  .dirty-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--accent);
    flex: none;
  }

  .right {
    justify-self: end;
    align-self: stretch;
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding-right: var(--space-2);
  }

  .btn {
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .btn.icon {
    width: 28px;
    padding: 0;
    font-size: 15px;
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
    color: var(--text-primary);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* ── ウィンドウコントロール（Windows 慣習：右上角に密着・フル高） ── */
  .window-controls {
    display: flex;
    align-items: stretch;
    align-self: stretch;
  }

  .wc {
    width: 46px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .wc:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .wc.close:hover {
    background: var(--danger-fg);
    color: #ffffff;
  }

  .wc:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
    color: var(--text-primary);
  }
</style>
