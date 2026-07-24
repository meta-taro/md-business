<script lang="ts">
  import { tick } from 'svelte';
  import { search, type SearchTarget } from './search.svelte';
  import { displayIndex } from './searchLogic';
  import { t } from '$lib/i18n/i18n.svelte';

  // エディター／プレビュー共通の検索バー。所属ペイン（pane）内の右上に浮かせ、その対象が
  // アクティブなときだけ表示する（各ペインが 1 つずつ持ち、target 一致で出し分ける）。
  // 状態は search ストアに集約し、ここは入力とボタンの結線だけを持つ（ハイライトは各バインド層）。
  interface Props {
    /** このバーが属するペイン。search.target と一致するときだけ描画する。 */
    pane: SearchTarget;
  }
  const { pane }: Props = $props();

  // このバーを表示すべきか（開いている & 対象がこのペイン）。
  const visible = $derived(search.open && search.target === pane);

  let inputEl = $state<HTMLInputElement>();

  // 表示されたら入力へフォーカス（tick でマウント後を待つ）。
  $effect(() => {
    if (visible && inputEl) {
      void tick().then(() => inputEl?.focus());
    }
  });

  const targetLabel = $derived(
    search.target === 'editor' ? t('search.inEditor') : t('search.inPreview'),
  );

  // 件数表示。マッチ有りは「3/12」、クエリ有り 0 件は「該当なし」、空クエリは無表示。
  const countLabel = $derived.by(() => {
    if (search.query === '') return '';
    if (search.count === 0) return t('search.noMatches');
    return t('search.count', { cur: displayIndex(search.current, search.count), total: search.count });
  });

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      search.close();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) search.prev();
      else search.next();
    }
  }
</script>

{#if visible}
  <div class="search-bar" role="search">
    <span class="target" title={targetLabel}>{targetLabel}</span>

    <input
      bind:this={inputEl}
      class="query"
      type="text"
      value={search.query}
      oninput={(e) => search.setQuery(e.currentTarget.value)}
      onkeydown={onKeydown}
      placeholder={t('search.placeholder')}
      aria-label={t('search.placeholder')}
      spellcheck="false"
      autocomplete="off"
    />

    <span class="count" class:none={search.query !== '' && search.count === 0}>{countLabel}</span>

    <div class="opts">
      <!-- 大文字小文字を区別（Aa） -->
      <button
        class="opt"
        class:on={search.options.caseSensitive}
        type="button"
        onclick={() => search.toggleOption('caseSensitive')}
        title={t('search.caseSensitive')}
        aria-label={t('search.caseSensitive')}
        aria-pressed={search.options.caseSensitive}
      >
        Aa
      </button>
      <!-- 単語単位（\b） -->
      <button
        class="opt"
        class:on={search.options.wholeWord}
        type="button"
        onclick={() => search.toggleOption('wholeWord')}
        title={t('search.wholeWord')}
        aria-label={t('search.wholeWord')}
        aria-pressed={search.options.wholeWord}
      >
        <span class="ab">ab</span>
      </button>
      <!-- 正規表現（.*） -->
      <button
        class="opt"
        class:on={search.options.regex}
        type="button"
        onclick={() => search.toggleOption('regex')}
        title={t('search.regex')}
        aria-label={t('search.regex')}
        aria-pressed={search.options.regex}
      >
        .*
      </button>
    </div>

    <div class="nav">
      <button
        class="icon"
        type="button"
        onclick={() => search.prev()}
        disabled={search.count === 0}
        title={t('search.previous')}
        aria-label={t('search.previous')}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M11 10L8 6l-3 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        class="icon"
        type="button"
        onclick={() => search.next()}
        disabled={search.count === 0}
        title={t('search.next')}
        aria-label={t('search.next')}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5 6l3 4 3-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        class="icon"
        type="button"
        onclick={() => search.close()}
        title={t('search.close')}
        aria-label={t('search.close')}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .search-bar {
    position: absolute;
    top: var(--space-2);
    right: var(--space-3);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md, 0 4px 12px rgb(0 0 0 / 0.18));
  }

  .target {
    font-size: var(--text-xs-size, 11px);
    color: var(--text-tertiary, var(--text-secondary));
    white-space: nowrap;
    max-width: 8ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .query {
    width: 200px;
    height: 26px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-app);
    color: var(--text-primary);
    font-size: var(--text-sm-size);
  }

  .query:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .count {
    min-width: 5ch;
    text-align: right;
    font-size: var(--text-xs-size, 11px);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .count.none {
    color: var(--danger-fg, var(--text-secondary));
  }

  .opts,
  .nav {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .opt {
    min-width: 26px;
    height: 26px;
    padding: 0 var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .opt .ab {
    text-decoration: underline;
  }

  .opt:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* 有効なオプションはアクセント地で「押下中」を明示。 */
  .opt.on {
    background: var(--accent-subtle);
    border-color: var(--accent);
    color: var(--accent);
  }

  .opt:focus-visible,
  .icon:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .icon {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .icon svg {
    width: 15px;
    height: 15px;
  }

  .icon:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .icon:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
