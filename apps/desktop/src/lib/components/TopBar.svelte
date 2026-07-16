<script lang="ts">
  import { themeController } from '$lib/theme.svelte';

  // Phase 1b は骨格。文書タイトル / status バッジ / PDF・⌘K・設定は
  // 後続フェーズ（1c ビューワー疎通・2 エディター・4 PDF）で実データに置き換える。
</script>

<header class="topbar">
  <div class="lead">
    <span class="brand-dot" aria-hidden="true"></span>
    <span class="brand">md-business</span>
  </div>

  <div class="center">
    <span class="doc-title">文書を選択してください</span>
  </div>

  <div class="actions">
    <button class="btn ghost" type="button" disabled title="PDF 出力（Phase 4）">PDF</button>
    <button class="btn ghost kbd" type="button" disabled title="コマンドパレット（後続フェーズ）">
      ⌘K
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
    <button class="btn ghost icon" type="button" disabled title="設定（後続フェーズ）" aria-label="設定">
      ⚙
    </button>
  </div>
</header>

<style>
  .topbar {
    height: var(--topbar-h);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-3);
    padding: 0 var(--space-4);
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
    user-select: none;
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
  }

  .doc-title {
    font-size: var(--text-sm-size);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    justify-self: end;
    display: flex;
    align-items: center;
    gap: var(--space-1);
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
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .btn.icon {
    width: 28px;
    padding: 0;
    font-size: 15px;
  }

  .btn.kbd {
    font-variant-numeric: tabular-nums;
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
</style>
