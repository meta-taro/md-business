<script lang="ts">
  // Git は共有ストアの実データを描画する（フェーズ3 Git・フォージ）。MCP はフェーズ4で実装。
  // Commit / Push は baseline §6 により「人間のみ」の視覚シグナルとして無効固定
  //（push はアプリからは実行しない。⚠ で人間ゲートを明示）。
  // ブランチ表示はクリックで切替ポップオーバーを開く（switch は作業ツリー内のローカル操作で
  // push/commit ではないため、アプリから実行してよい。-f なしで衝突時は失敗＝破壊しない）。
  import { git } from '$lib/git/git.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { forgeLabel } from '$lib/git/gitStatus';

  let pickerOpen = $state(false);
  let switching = $state(false);
  let switchError = $state<string | null>(null);

  function togglePicker(): void {
    pickerOpen = !pickerOpen;
    switchError = null;
    // 走査時に取得済みだが、未取得なら開いた時点で読み込む（防御）。
    if (pickerOpen && workspace.root !== null && git.branches.length === 0) {
      void git.loadBranches(workspace.root);
    }
  }

  function closePicker(): void {
    pickerOpen = false;
    switchError = null;
  }

  /** ブランチを選択して切り替える。衝突（未コミット変更）時はエラーを表示して開いたまま。 */
  async function choose(name: string): Promise<void> {
    if (name === git.branch) {
      closePicker();
      return;
    }
    switching = true;
    switchError = null;
    try {
      await workspace.switchBranch(name);
      pickerOpen = false;
    } catch (e) {
      // Rust の Err(String) は reject 値として届く（Error インスタンスとは限らない）。
      switchError = e instanceof Error ? e.message : String(e);
    } finally {
      switching = false;
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && pickerOpen) closePicker();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<footer class="statusbar">
  <div class="left">
    {#if git.isRepo}
      <div class="branch-wrap">
        <button
          class="branch-btn"
          type="button"
          title="クリックでブランチを切り替え"
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          onclick={togglePicker}
        >
          <span class="dot ok" aria-hidden="true"></span>{git.branch ?? 'detached'}
          <span class="caret" class:up={pickerOpen} aria-hidden="true">▾</span>
        </button>

        {#if pickerOpen}
          <!-- 外側クリックで閉じる透明バックドロップ。 -->
          <button class="backdrop" type="button" aria-label="閉じる" onclick={closePicker}></button>
          <div class="picker" role="listbox" aria-label="ブランチを切り替え">
            {#if switchError}
              <div class="picker-error" role="alert">
                <strong>切り替えできませんでした</strong>
                <pre>{switchError}</pre>
              </div>
            {/if}
            {#if git.branches.length === 0}
              <p class="picker-empty">ローカルブランチがありません</p>
            {:else}
              {#each git.branches as name (name)}
                <button
                  class="picker-item"
                  class:current={name === git.branch}
                  type="button"
                  role="option"
                  aria-selected={name === git.branch}
                  disabled={switching}
                  onclick={() => choose(name)}
                >
                  <span class="check" aria-hidden="true">{name === git.branch ? '✓' : ''}</span>
                  <span class="picker-name">{name}</span>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
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

  /* ── ブランチ切替 ─────────────────────────────────────────── */
  .branch-wrap {
    position: relative;
    display: inline-flex;
  }

  .branch-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-xs-size);
    cursor: pointer;
  }

  .branch-btn:hover {
    background: var(--bg-elevated);
    border-color: var(--border);
  }

  .caret {
    font-size: 9px;
    color: var(--text-tertiary);
    transition: transform 0.12s ease;
  }

  .caret.up {
    transform: rotate(180deg);
  }

  /* ポップオーバー外側のクリックを拾って閉じる不可視レイヤ。 */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    border: none;
    background: transparent;
    cursor: default;
  }

  /* ステータスバーは最下部なので上向きに開く。 */
  .picker {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 41;
    min-width: 200px;
    max-width: 320px;
    max-height: 320px;
    overflow-y: auto;
    padding: var(--space-1);
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.35));
  }

  .picker-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font-size: var(--text-xs-size);
    text-align: left;
    cursor: pointer;
  }

  .picker-item:hover:not(:disabled) {
    background: var(--bg-subtle);
  }

  .picker-item:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .picker-item.current {
    color: var(--accent);
    font-weight: 600;
  }

  .check {
    width: 12px;
    flex: none;
    color: var(--accent);
  }

  .picker-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-empty {
    margin: 0;
    padding: var(--space-2);
    color: var(--text-tertiary);
    font-size: var(--text-xs-size);
  }

  .picker-error {
    margin-bottom: var(--space-1);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--danger-fg, #c7502f) 12%, transparent);
    color: var(--text-primary);
  }

  .picker-error strong {
    display: block;
    margin-bottom: 4px;
    color: var(--danger-fg, #c7502f);
    font-size: var(--text-xs-size);
  }

  .picker-error pre {
    margin: 0;
    max-height: 120px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: var(--text-2xs-size, 10px);
    color: var(--text-secondary);
  }
</style>
