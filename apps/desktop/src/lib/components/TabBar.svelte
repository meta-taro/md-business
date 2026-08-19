<script lang="ts">
  // 開いている文書の帯。ファイル名と未保存の印だけを出す。
  //
  // 中身（本文・保存状態）はストアがタブごとに持っているので、ここは並べて渡すだけ。
  // 1 枚も開いていないときは帯そのものを出さない（空の帯は場所を取るだけで何も伝えない）。
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  const tabs = $derived(workspace.openTabs);

  /** 帯に出す名前。同じ名前が並びうるが、全パスは title で読める。 */
  function fileName(relPath: string): string {
    return relPath.split('/').pop() ?? relPath;
  }

  /** 中クリックで閉じる（編集ソフトの作法。押した先が閉じるので確認は挟まない）。 */
  function onAux(event: MouseEvent, id: string): void {
    if (event.button !== 1) return;
    event.preventDefault();
    void workspace.closeTab(id);
  }
</script>

{#if tabs.length > 0}
  <div class="tabbar" role="tablist" aria-label={t('page.tabsLabel')}>
    {#each tabs as tab (tab.id)}
      <div class="tab" class:active={tab.active} role="presentation">
        <button
          type="button"
          role="tab"
          class="tab-main"
          aria-selected={tab.active}
          tabindex={tab.active ? 0 : -1}
          title={tab.relPath}
          onclick={() => workspace.selectTab(tab.id)}
          onauxclick={(event) => onAux(event, tab.id)}
        >
          {#if tab.dirty}
            <span class="dot" title={t('page.tabUnsaved')} aria-label={t('page.tabUnsaved')}></span>
          {/if}
          <span class="name">{fileName(tab.relPath)}</span>
        </button>
        <button
          type="button"
          class="tab-close"
          aria-label={t('page.tabClose')}
          title={t('page.tabClose')}
          onclick={() => void workspace.closeTab(tab.id)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true"
            ><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.4" fill="none" /></svg
          >
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .tabbar {
    display: flex;
    flex: none;
    align-items: stretch;
    height: var(--tabbar-h);
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
    /* 上限（12 枚）でも収まらない幅のときは横に流す。畳んで隠すと、どれが開いて
       いるか分からなくなる。 */
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .tab {
    display: flex;
    align-items: center;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 200px;
    border-right: 1px solid var(--border);
    background: transparent;
    color: var(--text-tertiary);
  }

  /* 手前のタブは下のエディター面と同じ地色にして、面が続いて見えるようにする。 */
  .tab.active {
    background: var(--bg-app);
    color: var(--text-primary);
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .tab:not(.active):hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .tab-main {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: 0 var(--space-2) 0 var(--space-3);
    border: 0;
    background: none;
    color: inherit;
    font-size: var(--text-xs-size);
    cursor: pointer;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--accent);
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 20px;
    height: 20px;
    margin-right: var(--space-2);
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: inherit;
    opacity: 0;
    cursor: pointer;
  }

  /* 閉じるは常に出さない。12 枚並ぶと ✕ だけが目に付いて名前が読みにくくなる。 */
  .tab:hover .tab-close,
  .tab.active .tab-close,
  .tab-close:focus-visible {
    opacity: 1;
  }

  .tab-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tab-close svg {
    width: 12px;
    height: 12px;
  }
</style>
