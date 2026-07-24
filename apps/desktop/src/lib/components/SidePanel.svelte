<script lang="ts">
  // Git / AI / MCP パネル（DESIGN §6・既定は畳む）。開閉状態は親（+layout）が持ち、
  // グリッド幅を制御する。ここでは折畳レール + 展開時のタブ器のみ（実配線は後続フェーズ）。
  import { t } from '$lib/i18n/i18n.svelte';

  interface SidePanelProps {
    open: boolean;
    ontoggle: () => void;
  }

  let { open, ontoggle }: SidePanelProps = $props();

  const tabs = ['Git', 'Diff', 'AI', 'MCP'] as const;
</script>

<aside class="sidepanel" class:open aria-label={t('panel.label')}>
  <button
    class="rail-toggle"
    type="button"
    onclick={ontoggle}
    aria-expanded={open}
    title={open ? t('panel.collapse') : t('panel.expand')}
  >
    {open ? '›' : '‹'}
  </button>

  {#if open}
    <div class="body">
      <div class="tabs" role="tablist">
        {#each tabs as tab, i (tab)}
          <button class="tab" class:active={i === 0} type="button" role="tab" disabled>
            {tab}
          </button>
        {/each}
      </div>
      <div class="content">
        <p class="hint">{t('panel.hint')}</p>
      </div>
    </div>
  {/if}
</aside>

<style>
  .sidepanel {
    height: 100%;
    width: 40px;
    display: flex;
    background: var(--bg-subtle);
    border-left: 1px solid var(--border);
    overflow: hidden;
    transition: width var(--dur-slow) var(--ease);
  }

  .sidepanel.open {
    width: var(--sidepanel-w);
  }

  .rail-toggle {
    width: 40px;
    flex: none;
    border: none;
    border-right: 1px solid var(--border);
    background: transparent;
    color: var(--text-tertiary);
    font-size: 16px;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .rail-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .rail-toggle:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .tabs {
    height: 34px;
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    padding: 0 var(--space-2);
    border-bottom: 1px solid var(--border);
    flex: none;
  }

  .tab {
    padding: 0 var(--space-2);
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    font-size: var(--text-xs-size);
    cursor: pointer;
  }

  .tab.active {
    color: var(--text-primary);
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  .tab:disabled {
    cursor: default;
  }

  .content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
    text-align: center;
  }

  .hint {
    margin: 0;
    /* 文言の改行は \n（翻訳キー内）を pre-line で反映する。 */
    white-space: pre-line;
    font-size: var(--text-xs-size);
    line-height: 1.6;
    color: var(--text-tertiary);
  }
</style>
