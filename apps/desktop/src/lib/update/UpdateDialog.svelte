<script lang="ts">
  import { updater } from './updater.svelte';

  // 更新フローのモーダル。updater コントローラの state / visible を購読し、状態ごとに
  // 「確認中 / 最新 / 更新あり（リリースノート）/ ダウンロード中（進捗バー）/ インストール中 /
  // 再起動待ち / 失敗」を出し分ける。ボタンはコントローラのメソッドを叩くだけの薄いグルー。
  const state = $derived(updater.state);

  // ダウンロード / インストール中は誤って閉じられないよう、背景クリック・後で を無効化する。
  const busy = $derived(state.status === 'downloading' || state.status === 'installing');

  function onBackdrop(): void {
    if (!busy) updater.dismiss();
  }
</script>

{#if updater.visible && state.status !== 'idle'}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="アプリの更新">
    <!-- 背景。処理中でなければクリックで閉じる。 -->
    <button
      class="backdrop"
      type="button"
      aria-label="閉じる"
      disabled={busy}
      onclick={onBackdrop}
    ></button>

    <div class="card">
      {#if state.status === 'checking'}
        <div class="head">
          <span class="spinner" aria-hidden="true"></span>
          <h2 class="title">更新を確認しています…</h2>
        </div>
      {:else if state.status === 'up-to-date'}
        <div class="head">
          <span class="badge ok" aria-hidden="true">✓</span>
          <h2 class="title">最新の状態です</h2>
        </div>
        <p class="desc">お使いの md-business は最新バージョンです。</p>
        <div class="actions">
          <button class="btn primary" type="button" onclick={() => updater.dismiss()}>閉じる</button>
        </div>
      {:else if state.status === 'available'}
        <div class="head">
          <span class="badge new" aria-hidden="true">↑</span>
          <h2 class="title">新しいバージョン v{state.version} があります</h2>
        </div>
        {#if state.notes.trim().length > 0}
          <div class="notes-label">更新内容</div>
          <div class="notes">{state.notes}</div>
        {/if}
        <div class="actions">
          <button class="btn ghost" type="button" onclick={() => updater.dismiss()}>後で</button>
          <button class="btn primary" type="button" onclick={() => updater.downloadAndInstall()}>
            今すぐ更新
          </button>
        </div>
      {:else if state.status === 'downloading'}
        <div class="head">
          <span class="spinner" aria-hidden="true"></span>
          <h2 class="title">ダウンロード中… {state.percent}%</h2>
        </div>
        <div
          class="progress"
          role="progressbar"
          aria-valuenow={state.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div class="progress-fill" style="width: {state.percent}%"></div>
        </div>
      {:else if state.status === 'installing'}
        <div class="head">
          <span class="spinner" aria-hidden="true"></span>
          <h2 class="title">インストール中…</h2>
        </div>
        <p class="desc">更新を適用しています。しばらくお待ちください。</p>
      {:else if state.status === 'ready'}
        <div class="head">
          <span class="badge ok" aria-hidden="true">✓</span>
          <h2 class="title">更新の準備ができました</h2>
        </div>
        <p class="desc">v{state.version} を適用するにはアプリを再起動してください。</p>
        <div class="actions">
          <button class="btn ghost" type="button" onclick={() => updater.dismiss()}>後で</button>
          <button class="btn primary" type="button" onclick={() => updater.relaunch()}>
            再起動して完了
          </button>
        </div>
      {:else if state.status === 'error'}
        <div class="head">
          <span class="badge err" aria-hidden="true">!</span>
          <h2 class="title">更新できませんでした</h2>
        </div>
        <p class="desc">{state.message}</p>
        <div class="actions">
          <button class="btn primary" type="button" onclick={() => updater.dismiss()}>閉じる</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
  }

  /* 背景を暗転させ、処理中でなければクリックで閉じる不可視ボタンを兼ねる。 */
  .backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: rgba(0, 0, 0, 0.5);
    cursor: default;
  }

  .card {
    position: relative;
    z-index: 1;
    width: min(440px, 100%);
    padding: var(--space-5);
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg, 0 16px 48px rgba(0, 0, 0, 0.45));
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .title {
    margin: 0;
    font-size: var(--text-md-size, 15px);
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.4;
  }

  .badge {
    flex: none;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
  }

  .badge.ok {
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .badge.new {
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .badge.err {
    background: var(--danger-subtle, rgba(220, 60, 60, 0.16));
    color: var(--danger-fg);
  }

  /* 回転スピナー。線 1 本を欠いた円を回してビジー状態を示す。 */
  .spinner {
    flex: none;
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-strong);
    border-top-color: var(--accent);
    border-radius: var(--radius-full);
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .desc {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm-size);
    line-height: 1.7;
    color: var(--text-secondary);
  }

  .notes-label {
    margin-top: var(--space-4);
    font-size: var(--text-xs-size);
    font-weight: 600;
    color: var(--text-tertiary);
  }

  /* リリースノート本文。改行を保ち、長文はスクロールさせる。 */
  .notes {
    margin-top: var(--space-2);
    max-height: 220px;
    overflow-y: auto;
    padding: var(--space-3);
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: var(--text-sm-size);
    line-height: 1.6;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .progress {
    margin-top: var(--space-4);
    height: 8px;
    background: var(--bg-subtle);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-gradient, var(--accent));
    border-radius: var(--radius-full);
    transition: width var(--dur-fast, 120ms) ease;
  }

  .actions {
    margin-top: var(--space-5);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .btn {
    height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font-size: var(--text-sm-size);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--dur-fast, 120ms) ease,
      color var(--dur-fast, 120ms) ease,
      border-color var(--dur-fast, 120ms) ease;
  }

  .btn.primary {
    background: var(--accent);
    color: var(--accent-on, #ffffff);
  }

  .btn.primary:hover {
    background: var(--accent-strong, var(--accent));
    filter: brightness(1.05);
  }

  .btn.ghost {
    background: transparent;
    color: var(--text-secondary);
    border-color: var(--border-strong);
  }

  .btn.ghost:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }
</style>
