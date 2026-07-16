<script lang="ts">
  import { onMount } from 'svelte';

  // Phase 1a の疎通確認用プレースホルダ。Tauri webview が SvelteKit(SPA) を
  // ロードできているかを画面で確認する。実アプリシェルは Phase 1b で置き換える。
  let tauriReady = $state<'checking' | 'ready' | 'browser'>('checking');

  onMount(async () => {
    try {
      // @tauri-apps/api は Tauri webview 内でのみ __TAURI_INTERNALS__ を持つ。
      // ブラウザ（vite dev 直開き）では未定義なので分岐して表示を変える。
      const isTauri = '__TAURI_INTERNALS__' in window;
      tauriReady = isTauri ? 'ready' : 'browser';
    } catch {
      tauriReady = 'browser';
    }
  });
</script>

<main>
  <h1>md-business <span class="tag">desktop</span></h1>
  <p class="lead">Tauri 2 + SvelteKit scaffold — Phase 1a</p>
  <p class="status" data-state={tauriReady}>
    {#if tauriReady === 'checking'}
      環境を確認中…
    {:else if tauriReady === 'ready'}
      ✓ Tauri webview で動作中
    {:else}
      ブラウザで動作中（Tauri 外）
    {/if}
  </p>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      sans-serif;
    color: #1c1c22;
    background: #ffffff;
  }
  :global(html[data-theme='dark']) main {
    color: #ececf0;
    background: #0f0f13;
  }
  h1 {
    font-size: 2rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .tag {
    font-size: 0.9rem;
    font-weight: 600;
    color: #5b5bd6;
    vertical-align: super;
  }
  .lead {
    margin: 0;
    opacity: 0.7;
  }
  .status {
    margin: 0;
    font-size: 0.9rem;
    padding: 0.4rem 0.8rem;
    border-radius: 8px;
    background: rgba(91, 91, 214, 0.08);
    color: #5b5bd6;
  }
</style>
