<script lang="ts">
  import { onMount } from 'svelte';

  // 中央 = 左右 2 分割（DESIGN §6）。Phase 1b は骨格＝空状態の 2 ペイン。
  // 左＝Markdown エディター（Phase 2 で CodeMirror 6）、右＝ビューワー（Phase 1c で
  // renderer-pdf の HTML を iframe 埋め込み）。分割比のドラッグ調整・永続化は後続フェーズ。
  let tauriReady = $state<'checking' | 'ready' | 'browser'>('checking');

  onMount(() => {
    // Tauri webview 内かどうかを表示（疎通確認・Phase 1a から継続）。
    tauriReady = '__TAURI_INTERNALS__' in window ? 'ready' : 'browser';
  });
</script>

<div class="split">
  <section class="pane editor" aria-label="Markdown エディター">
    <div class="pane-head">エディター</div>
    <div class="pane-empty">
      <p class="hint">左に Markdown、右にビューワー。<br />編集するとプレビューが即同期します。</p>
    </div>
  </section>

  <section class="pane preview" aria-label="ビューワー（プレビュー）">
    <div class="pane-head">プレビュー</div>
    <div class="pane-empty">
      <p class="hint">文書を開くと用途別ビューワーが起動します</p>
      <span class="env" data-state={tauriReady}>
        {#if tauriReady === 'checking'}
          環境を確認中…
        {:else if tauriReady === 'ready'}
          ✓ Tauri webview で動作中
        {:else}
          ブラウザで動作中（Tauri 外）
        {/if}
      </span>
    </div>
  </section>
</div>

<style>
  .split {
    height: 100%;
    display: grid;
    grid-template-columns: minmax(var(--pane-min), 1fr) minmax(var(--pane-min), 1fr);
    min-height: 0;
  }

  .pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .pane.editor {
    border-right: 1px solid var(--border);
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

  .editor .pane-empty {
    font-family: var(--font-mono);
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

  .env[data-state='browser'] {
    background: var(--neutral-bg);
    color: var(--neutral-fg);
  }

  /* < 768px: 左右分割をやめ縦積み（DESIGN §7.1・簡易対応。タブ切替は後続） */
  @media (max-width: 767px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 1fr 1fr;
    }

    .pane.editor {
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
  }
</style>
