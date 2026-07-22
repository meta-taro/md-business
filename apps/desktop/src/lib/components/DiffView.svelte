<script lang="ts">
  // 差分ビュー（プレビュー面に表示する git diff）。田中さん依頼 2026-07-22。
  // 生 diff テキストは diffView ストアが持ち、ここは parseUnifiedDiff で行種別に分類して
  // 色分け描画するだけ（分類ロジックは diffParse.ts で単体テスト済み）。
  import { diffView } from '$lib/git/diffView.svelte';
  import { parseUnifiedDiff } from '$lib/git/diffParse';
  import { gitMarkLetter } from '$lib/git/gitStatus';

  // raw が変わるたびに行配列を導出。差分なし（空文字列）は空配列＝「差分なし」表示に分岐。
  const lines = $derived(parseUnifiedDiff(diffView.raw));
  const hasDiff = $derived(lines.length > 0);
</script>

<div class="diff" aria-label="差分ビュー">
  <div class="diff-head">
    <div class="head-left">
      {#if diffView.state}
        <span class="badge" data-git={diffView.state} title={diffView.state}>
          {gitMarkLetter(diffView.state)}
        </span>
      {/if}
      <span class="path" title={diffView.relPath ?? ''}>{diffView.relPath ?? ''}</span>
    </div>
    <button
      class="close-btn"
      type="button"
      onclick={() => diffView.close()}
      title="差分を閉じてプレビューに戻る"
    >
      プレビューに戻る
    </button>
  </div>

  {#if diffView.loading}
    <div class="state">差分を取得中…</div>
  {:else if diffView.error}
    <div class="state err" role="alert">
      <strong>差分を取得できませんでした</strong>
      <pre>{diffView.error}</pre>
    </div>
  {:else if !hasDiff}
    <div class="state">
      このファイルにディスク上の差分はありません（保存済み・ステージ内容と一致）。
    </div>
  {:else}
    <div class="diff-body">
      {#each lines as line, i (i)}
        <div class="line" data-kind={line.kind}>
          <span class="gutter" aria-hidden="true">
            {#if line.kind === 'add'}+{:else if line.kind === 'del'}-{/if}
          </span>
          <span class="text">{line.text || ' '}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .diff {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-app);
  }

  .diff-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    flex: none;
  }

  .head-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .badge {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs-size, 10px);
    font-weight: 700;
    background: var(--bg-elevated);
  }

  /* FileTree / ソース管理パネルと同じ gitDecoration 色。 */
  .badge[data-git='modified'],
  .badge[data-git='renamed'] {
    color: #d9a441;
  }
  .badge[data-git='untracked'],
  .badge[data-git='added'] {
    color: #4ca66a;
  }
  .badge[data-git='deleted'] {
    color: #c7502f;
  }
  .badge[data-git='conflicted'] {
    color: #c94f6d;
  }

  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
  }

  .close-btn {
    flex: none;
    height: 24px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-size: var(--text-xs-size);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease);
  }

  .close-btn:hover {
    background: var(--bg-hover);
  }

  .state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6);
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--text-sm-size);
  }

  .state.err strong {
    color: var(--danger-fg, #c7502f);
  }

  .state.err pre {
    margin: 0;
    max-width: 100%;
    max-height: 160px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: var(--text-2xs-size, 10px);
    color: var(--text-secondary);
  }

  .diff-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: var(--space-2) 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs-size);
    line-height: 1.6;
  }

  .line {
    display: flex;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    white-space: pre;
  }

  .gutter {
    flex: none;
    width: 12px;
    text-align: center;
    color: var(--text-tertiary);
    user-select: none;
  }

  .text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  /* 追加・削除・hunk・meta の行を GitHub 風の淡い地色で塗り分ける。 */
  .line[data-kind='add'] {
    background: color-mix(in srgb, #4ca66a 16%, transparent);
  }
  .line[data-kind='add'] .gutter {
    color: #4ca66a;
  }

  .line[data-kind='del'] {
    background: color-mix(in srgb, #c7502f 15%, transparent);
  }
  .line[data-kind='del'] .gutter {
    color: #c7502f;
  }

  .line[data-kind='hunk'] {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }

  .line[data-kind='meta'] {
    color: var(--text-tertiary);
  }
</style>
