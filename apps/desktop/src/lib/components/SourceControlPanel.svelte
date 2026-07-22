<script lang="ts">
  // 下部「ソース管理」パネル（GitHub Desktop 風レイアウトを DevTools 風の下部ドロワーに）。
  // 田中さん依頼（2026-07-22）: アプリから commit / push / pull できる仕組み。
  //
  // §6（push=人間）との整合: これはアプリ「エンドユーザー（＝人間）が自分の文書リポに対して
  // ボタンで push する」機能であり、開発フローの「AI が push しない」規約とは別レイヤ。人間が
  // 明示クリックして初めて push が走る＝§6 の "push=人間・人間確認" を満たす。認証は OS の git
  // 資格情報／SSH に委ね、アプリは資格情報を一切保持・入力しない（§15）。
  import { git } from '$lib/git/git.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { gitMarkLetter } from '$lib/git/gitStatus';

  interface Props {
    open: boolean;
    onclose: () => void;
  }
  const { open, onclose }: Props = $props();

  let message = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);

  const root = $derived(workspace.root);
  const canCommit = $derived(
    !busy && git.isRepo && git.changeCount > 0 && message.trim().length > 0 && root !== null,
  );
  // push / pull は upstream 未設定・up-to-date でも git 側が適切に応答する。isRepo なら押下可
  // とし、失敗（認証・非 ff・upstream 無し）は stderr をそのまま提示する。
  const canPush = $derived(!busy && git.isRepo && root !== null);
  const canPull = $derived(!busy && git.isRepo && root !== null);

  function toErr(e: unknown): string {
    // Rust の Err(String) は reject 値として届く（Error インスタンスとは限らない）。
    return e instanceof Error ? e.message : String(e);
  }

  async function doCommit(): Promise<void> {
    if (!canCommit || root === null) return;
    busy = true;
    error = null;
    notice = null;
    try {
      const count = git.changeCount;
      await git.commit(root, message);
      message = '';
      notice = `${count} 件の変更をコミットしました`;
      // ツリーの色マークは git ストア更新で自動反映。ワークスペースの再走査は不要。
    } catch (e) {
      error = toErr(e);
    } finally {
      busy = false;
    }
  }

  async function doPush(): Promise<void> {
    if (!canPush || root === null) return;
    busy = true;
    error = null;
    notice = null;
    try {
      await git.push(root);
      notice = 'push しました';
    } catch (e) {
      error = toErr(e);
    } finally {
      busy = false;
    }
  }

  async function doPull(): Promise<void> {
    if (!canPull || root === null) return;
    busy = true;
    error = null;
    notice = null;
    try {
      await git.pull(root);
      notice = 'pull しました';
    } catch (e) {
      error = toErr(e);
    } finally {
      busy = false;
    }
  }

  // Ctrl/⌘+Enter でコミット（メッセージ入力中の定番）。
  function onMessageKeydown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void doCommit();
    }
  }
</script>

{#if open}
  <section class="scm" aria-label="ソース管理">
    <header class="scm-head">
      <div class="head-left">
        <span class="title">ソース管理</span>
        {#if git.isRepo}
          <span class="branch"><span class="dot ok" aria-hidden="true"></span>{git.branch ?? 'detached'}</span>
          {#if git.ahead > 0 || git.behind > 0}
            <span class="muted" title="リモートとの先行 / 遅延コミット数">↑{git.ahead} ↓{git.behind}</span>
          {/if}
        {:else}
          <span class="muted">リポジトリ未接続</span>
        {/if}
      </div>
      <div class="head-right">
        <button class="chip" type="button" onclick={doPull} disabled={!canPull} title="git pull --ff-only（fast-forward のみ）">
          Pull{#if git.behind > 0}<span class="count">{git.behind}</span>{/if}
        </button>
        <button class="chip" type="button" onclick={doPush} disabled={!canPush} title="git push（--force なし・認証は OS の git 資格情報）">
          Push{#if git.ahead > 0}<span class="count">{git.ahead}</span>{/if}
        </button>
        <button class="icon-btn" type="button" onclick={onclose} title="閉じる" aria-label="ソース管理を閉じる">▾</button>
      </div>
    </header>

    {#if error}
      <div class="banner err" role="alert">
        <strong>失敗しました</strong>
        <pre>{error}</pre>
      </div>
    {:else if notice}
      <div class="banner ok" role="status">{notice}</div>
    {/if}

    <div class="scm-body">
      <div class="changes">
        <div class="col-title">変更 <span class="muted">({git.changeCount})</span></div>
        {#if git.changeCount === 0}
          <p class="empty">変更はありません</p>
        {:else}
          <ul class="file-list">
            {#each git.status.files as f (f.relPath)}
              <li class="file-row" data-git={f.state}>
                <span class="mark" title={f.state}>{gitMarkLetter(f.state)}</span>
                <span class="path" title={f.relPath}>{f.relPath}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="commit">
        <div class="col-title">コミット</div>
        <textarea
          class="msg"
          bind:value={message}
          placeholder="変更の概要を入力（Ctrl/⌘+Enter でコミット）"
          rows="3"
          disabled={busy || !git.isRepo}
          onkeydown={onMessageKeydown}
        ></textarea>
        <button class="commit-btn" type="button" onclick={doCommit} disabled={!canCommit}>
          {busy ? '処理中…' : `${git.changeCount > 0 ? git.changeCount + ' 件を' : ''}コミット`}
        </button>
        <p class="hint">全変更をステージ（git add -A）してコミットします。</p>
      </div>
    </div>
  </section>
{/if}

<style>
  .scm {
    display: flex;
    flex-direction: column;
    max-height: 320px;
    background: var(--bg-subtle);
    border-top: 1px solid var(--border-strong);
    font-size: var(--text-sm-size);
    color: var(--text-primary);
  }

  .scm-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  .head-left,
  .head-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .title {
    font-weight: 600;
    font-size: var(--text-xs-size);
    letter-spacing: var(--tracking-tight);
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .branch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
  }

  .muted {
    color: var(--text-tertiary);
    font-size: var(--text-xs-size);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    flex: none;
  }

  .dot.ok {
    background: var(--success-fg, #4ca66a);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
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

  .chip:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .count {
    min-width: 16px;
    padding: 0 4px;
    border-radius: var(--radius-full);
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: var(--text-2xs-size, 10px);
    font-weight: 600;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .banner {
    margin: var(--space-2) var(--space-3) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs-size);
  }

  .banner.err {
    background: color-mix(in srgb, var(--danger-fg, #c7502f) 12%, transparent);
  }

  .banner.err strong {
    display: block;
    margin-bottom: 4px;
    color: var(--danger-fg, #c7502f);
  }

  .banner.err pre {
    margin: 0;
    max-height: 96px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: var(--text-2xs-size, 10px);
    color: var(--text-secondary);
  }

  .banner.ok {
    background: color-mix(in srgb, var(--success-fg, #4ca66a) 14%, transparent);
    color: var(--text-secondary);
  }

  .scm-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    padding: var(--space-3);
    min-height: 0;
    overflow: hidden;
  }

  .col-title {
    margin-bottom: var(--space-2);
    font-size: var(--text-xs-size);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .changes {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .file-list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    max-height: 200px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-app);
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 3px var(--space-2);
    font-size: var(--text-xs-size);
  }

  .mark {
    flex: none;
    width: 12px;
    text-align: center;
    font-weight: 700;
    font-size: var(--text-2xs-size, 10px);
  }

  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
  }

  /* FileTree と同じ gitDecoration 色（明暗どちらでも読める中間トーン）。 */
  .file-row[data-git='modified'],
  .file-row[data-git='renamed'] {
    color: #d9a441;
  }

  .file-row[data-git='untracked'],
  .file-row[data-git='added'] {
    color: #4ca66a;
  }

  .file-row[data-git='deleted'] {
    color: #c7502f;
  }

  .file-row[data-git='conflicted'] {
    color: #c94f6d;
  }

  .empty {
    margin: 0;
    padding: var(--space-3);
    color: var(--text-tertiary);
    font-size: var(--text-xs-size);
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    text-align: center;
  }

  .commit {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .msg {
    resize: none;
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-app);
    color: var(--text-primary);
    font-family: var(--font-sans, inherit);
    font-size: var(--text-sm-size);
    line-height: 1.5;
  }

  .msg:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .msg:disabled {
    opacity: 0.6;
  }

  .commit-btn {
    margin-top: var(--space-2);
    height: 30px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-contrast, #fff);
    font-size: var(--text-sm-size);
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--dur-fast) var(--ease);
  }

  .commit-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .commit-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .hint {
    margin: var(--space-1) 0 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs-size, 10px);
  }
</style>
