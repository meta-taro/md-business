<script lang="ts">
  /**
   * 見出しから開く、1 列分の並べ替えと絞り込みのメニュー。
   *
   * どちらも表の見せ方で、ファイルには何も書かない。条件を持つのは親で、ここは
   * 今の条件を受け取って、変えた条件を返すだけ。
   *
   * 一覧から選ぶ絞り込みは押したそばから効かせ、文字と範囲は確定（Enter か適用）で効かせる。
   * 打鍵ごとに効かせると、1 文字目で表がほとんど空になって、打っている本人が驚く。
   */
  import { untrack } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import type { ColumnCondition } from './gridColumnFilter';
  import type { FilterMode } from './gridColumnMenu';
  import type { SortDirection } from './gridSort';

  interface Props {
    x: number;
    y: number;
    /** 列名（メニューの見出しに出す）。 */
    name: string;
    mode: FilterMode;
    /** `values` のときに並べる値（空欄は `''`）。 */
    choices: readonly string[];
    /** この列の並べ替えの向き。この列で並べていなければ null。 */
    sortDir: SortDirection | null;
    /** この列の絞り込み条件。無ければ null。 */
    condition: ColumnCondition | null;
    onSort: (dir: SortDirection | null) => void;
    onCondition: (condition: ColumnCondition | null) => void;
    onClose: () => void;
  }

  let { x, y, name, mode, choices, sortDir, condition, onSort, onCondition, onClose }: Props =
    $props();

  // 条件が無い＝全部選んでいる状態として見せる。
  const selected = $derived(
    new Set(condition?.kind === 'values' ? condition.values : choices),
  );

  function toggleValue(value: string): void {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // 全部選んだら条件ごと外す。残しておくと、後から増えた値が黙って外れる。
    onCondition(
      choices.every((choice) => next.has(choice))
        ? null
        : { kind: 'values', values: choices.filter((choice) => next.has(choice)) },
    );
  }

  // 文字と範囲は下書きを持ち、確定で親へ渡す。
  // 下書きの初期値は開いた時点の条件。開いている間に条件が変わっても打ちかけを上書きしない。
  const initial = untrack(() => condition);
  let text = $state(initial?.kind === 'text' ? initial.text : '');
  let min = $state(initial?.kind === 'range' ? initial.min : '');
  let max = $state(initial?.kind === 'range' ? initial.max : '');

  function apply(): void {
    if (mode === 'text') {
      onCondition(text.trim() === '' ? null : { kind: 'text', text });
    } else if (mode === 'number' || mode === 'date') {
      onCondition(
        min.trim() === '' && max.trim() === '' ? null : { kind: 'range', type: mode, min, max },
      );
    }
    onClose();
  }

  function onEnter(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    }
  }

  function focusOnOpen(node: HTMLInputElement): void {
    node.focus();
  }

  const inputType = $derived(mode === 'number' ? 'number' : mode === 'date' ? 'date' : 'text');
</script>

<button
  type="button"
  class="menu-backdrop"
  aria-label={t('grid.menuClose')}
  onclick={onClose}
  oncontextmenu={(e) => {
    e.preventDefault();
    onClose();
  }}
></button>
<div class="sf-menu" role="dialog" aria-label={t('grid.columnMenu', { name })} style={`left:${x}px; top:${y}px`}>
  <p class="sf-head">{t('grid.sortHead')}</p>
  <button type="button" class="sf-item" class:checked={sortDir === 'asc'} onclick={() => onSort('asc')}>
    <span class="check">{sortDir === 'asc' ? '✓' : ''}</span>{t('grid.sortAsc')}
  </button>
  <button type="button" class="sf-item" class:checked={sortDir === 'desc'} onclick={() => onSort('desc')}>
    <span class="check">{sortDir === 'desc' ? '✓' : ''}</span>{t('grid.sortDesc')}
  </button>
  {#if sortDir !== null}
    <button type="button" class="sf-item" onclick={() => onSort(null)}>
      <span class="check"></span>{t('grid.sortOff')}
    </button>
  {/if}

  <p class="sf-head sf-sep">{t('grid.filterHead', { name })}</p>
  {#if mode === 'values'}
    <div class="sf-values">
      {#each choices as choice (choice)}
        <label class="sf-value">
          <input type="checkbox" checked={selected.has(choice)} onchange={() => toggleValue(choice)} />
          <span class:empty={choice === ''}>{choice === '' ? t('grid.filterEmpty') : choice}</span>
        </label>
      {/each}
    </div>
    {#if condition !== null}
      <button type="button" class="sf-item" onclick={() => onCondition(null)}>
        <span class="check"></span>{t('grid.filterAll')}
      </button>
    {/if}
  {:else}
    {#if mode === 'text'}
      <input
        class="sf-input"
        type="text"
        placeholder={t('grid.filterContains')}
        bind:value={text}
        onkeydown={onEnter}
        use:focusOnOpen
      />
    {:else}
      <div class="sf-range">
        <input
          class="sf-input"
          type={inputType}
          aria-label={t('grid.filterMin')}
          placeholder={t('grid.filterMin')}
          bind:value={min}
          onkeydown={onEnter}
          use:focusOnOpen
        />
        <span aria-hidden="true">–</span>
        <input
          class="sf-input"
          type={inputType}
          aria-label={t('grid.filterMax')}
          placeholder={t('grid.filterMax')}
          bind:value={max}
          onkeydown={onEnter}
        />
      </div>
    {/if}
    <div class="sf-actions">
      <button type="button" class="sf-btn" onclick={apply}>{t('grid.filterApply')}</button>
      {#if condition !== null}
        <button
          type="button"
          class="sf-btn"
          onclick={() => {
            onCondition(null);
            onClose();
          }}>{t('grid.filterColumnClear')}</button
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: transparent;
    border: none;
    padding: 0;
    cursor: default;
  }

  .sf-menu {
    position: fixed;
    z-index: 51;
    min-width: 200px;
    max-width: 280px;
    padding: var(--space-1);
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.28));
    font-size: var(--text-sm-size);
  }

  .sf-head {
    margin: 0;
    padding: var(--space-1) var(--space-2);
    color: var(--text-tertiary);
    font-size: var(--text-2xs-size, var(--text-sm-size));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sf-sep {
    margin-top: var(--space-1);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }

  .sf-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm, 4px);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .sf-item:hover {
    background: var(--bg-hover);
  }

  .sf-item.checked {
    color: var(--accent);
  }

  .check {
    display: inline-block;
    width: 1em;
    text-align: center;
  }

  /* 選択肢が多い列でもメニューが画面からはみ出さないよう、一覧だけ中でスクロールさせる。 */
  .sf-values {
    max-height: 240px;
    overflow-y: auto;
  }

  .sf-value {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm, 4px);
    color: var(--text-primary);
    cursor: pointer;
  }

  .sf-value:hover {
    background: var(--bg-hover);
  }

  .sf-value .empty {
    color: var(--text-tertiary);
  }

  .sf-range {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--text-tertiary);
  }

  .sf-input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    margin: var(--space-1) 0;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 4px);
    background: var(--bg-app);
    color: var(--text-primary);
    font: inherit;
  }

  .sf-input:focus-visible {
    outline: none;
    border-color: var(--accent);
  }

  .sf-actions {
    display: flex;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .sf-btn {
    height: 26px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-app);
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    cursor: pointer;
  }

  .sf-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
