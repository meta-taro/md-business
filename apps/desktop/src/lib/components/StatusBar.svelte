<script lang="ts">
  // Git は共有ストアの実データを描画する（フェーズ3 Git・フォージ）。MCP はフェーズ4で実装。
  // Commit / Push は baseline §6 により「人間のみ」の視覚シグナルとして無効固定
  //（push はアプリからは実行しない。⚠ で人間ゲートを明示）。
  import { git } from '$lib/git/git.svelte';
  import { forgeLabel } from '$lib/git/gitStatus';
</script>

<footer class="statusbar">
  <div class="left">
    {#if git.isRepo}
      <span class="ind"><span class="dot ok" aria-hidden="true"></span>{git.branch ?? 'detached'}</span>
      {#if git.ahead > 0 || git.behind > 0}
        <span class="muted" title="リモートとの先行 / 遅延コミット数">↑{git.ahead} ↓{git.behind}</span>
      {/if}
      <span class="muted">変更 {git.changeCount}</span>
    {:else}
      <span class="muted">リポジトリ未接続</span>
    {/if}
    <button class="chip" type="button" disabled title="コミット（Git 連携フェーズ）">Commit</button>
    <button
      class="chip push"
      type="button"
      disabled
      title="push は人間が確認して実行します（baseline §6）"
    >
      <span class="warn" aria-hidden="true">⚠</span> Push
    </button>
  </div>

  <div class="right">
    <span class="ind"
      ><span class="dot" class:ok={git.forge !== null} class:neutral={git.forge === null} aria-hidden="true"
      ></span>forge: {forgeLabel(git.forge)}</span
    >
    <span class="ind"><span class="dot neutral" aria-hidden="true"></span>MCP: 未接続</span>
  </div>
</footer>

<style>
  .statusbar {
    height: var(--statusbar-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0 var(--space-4);
    background: var(--bg-subtle);
    border-top: 1px solid var(--border);
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
    user-select: none;
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .muted {
    color: var(--text-tertiary);
  }

  .chip {
    height: 22px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: var(--text-xs-size);
    cursor: pointer;
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .chip.push {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .warn {
    color: var(--warning-fg);
  }

  .ind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    flex: none;
  }

  .dot.neutral {
    background: var(--text-tertiary);
  }

  /* 接続済み（リポジトリ配下 / forge 判定済み）を示す緑ドット。 */
  .dot.ok {
    background: var(--success-fg, #4ca66a);
  }
</style>
