<script lang="ts">
  /**
   * 参考データ（.json / .xml）を木として並べるだけの表示。編集も保存もしない。
   *
   * 並び順・深さ・行の鍵は `dataDocument.readDataDocument` が決めており（そこで検査済み）、
   * ここは受け取った行を字下げして描くだけの薄い層。開けなかったときは、空の木ではなく
   * 理由の文を出す——中身が空のファイルと見分けが付かなくなるため。
   */
  import { t } from '$lib/i18n/i18n.svelte';
  import type { DataDocument } from './dataDocument';
  import { dataProblemMessage } from './dataProblemMessage';

  interface Props {
    doc: DataDocument;
  }
  const { doc }: Props = $props();

  // 字下げは深さに比例。CSS 変数へ渡して padding に効かせる。
  const INDENT_REM = 1.1;
</script>

{#if doc.kind === 'refused'}
  <div class="pane-empty">
    <p class="hint">{dataProblemMessage(doc.problem, t)}</p>
  </div>
{:else}
  <div class="tree" role="tree" aria-label={t('page.dataHead')}>
    {#each doc.rows as row (row.key)}
      <div
        class="row"
        role="treeitem"
        aria-level={row.depth + 1}
        aria-selected={false}
        aria-expanded={row.hasChildren ? true : undefined}
        style="--indent: {row.depth * INDENT_REM}rem"
      >
        <span class="name" class:branch={row.hasChildren}>{row.name}</span>
        {#each row.attributes as attr (attr.name)}
          <span class="attr"
            ><span class="attr-name">{attr.name}</span>=<span class="attr-value"
              >"{attr.value}"</span
            ></span
          >
        {/each}
        {#if row.value !== null}
          <span class="value" class:typed={row.valueType !== null && row.valueType !== 'string'}
            >{row.value}</span
          >
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .tree {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: var(--space-3) 0;
    font-family: var(--font-mono);
    font-size: var(--text-sm-size);
    line-height: 1.7;
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding-left: calc(var(--space-4) + var(--indent));
    padding-right: var(--space-4);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .row:hover {
    background: var(--bg-subtle);
  }

  .name {
    color: var(--text-secondary);
  }

  /* 子を持つ行は入れ物。値を持つ行と見分けが付くよう色を強める。 */
  .name.branch {
    color: var(--accent);
  }

  .attr {
    font-size: var(--text-xs-size);
    color: var(--text-tertiary);
  }

  .attr-value {
    color: var(--text-secondary);
  }

  .value {
    color: var(--text-primary);
  }

  /* 文字列以外（数値・真偽・null）は、引用符が無くても型が分かるよう色を変える。 */
  .value.typed {
    color: var(--schema-db-spec);
  }

  .pane-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    text-align: center;
  }

  .hint {
    margin: 0;
    font-size: var(--text-sm-size);
    line-height: 1.7;
    color: var(--text-tertiary);
  }
</style>
