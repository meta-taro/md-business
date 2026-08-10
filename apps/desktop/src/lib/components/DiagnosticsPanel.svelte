<script lang="ts">
  import { onMount } from 'svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { t } from '$lib/i18n/i18n.svelte';
  import type { MessageKey } from '$lib/i18n/messages';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { perf } from '$lib/diagnostics/perf.svelte';
  import { summarize, formatReport, type SpanName } from '$lib/diagnostics/perf';

  // 診断タブ。1 回の編集がどの区間で時間を使っているかを出す。
  //
  // 検証シートは 1 セル確定するたびにファイル全文を組み直しており、「遅い」と感じても
  // どこが遅いのかは画面から分からない。数字だけ渡されても読む側は判断できないので、
  // 版・環境・ファイルの規模を添えて 1 枚で写せる形にし、そのまま不具合報告に貼れるようにする。
  //
  // バージョンは Tauri ランタイム外（素の vite）では取れないため、その場合は不明のまま進む。

  const SPAN_LABEL: Record<SpanName, MessageKey> = {
    serialize: 'diag.span.serialize',
    history: 'diag.span.history',
    dirty: 'diag.span.dirty',
    render: 'diag.span.render',
    save: 'diag.span.save',
  };

  let version = $state<string | null>(null);

  onMount(async () => {
    try {
      version = await getVersion();
    } catch {
      version = null;
    }
  });

  const stats = $derived(summarize(perf.samples));
  // 文書の形はこのタブが出ている間だけ数える。編集のたびに数えると計測へ混ざる。
  const shape = $derived(perf.shape());
  const chars = $derived(workspace.source.length);

  function ms(value: number): string {
    return value.toFixed(1);
  }

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyReport(): Promise<void> {
    const text = formatReport(
      {
        version: version ?? '?',
        platform: navigator.userAgent,
        fileName: workspace.activePath,
        scale: {
          chars,
          rows: shape.rows,
          columns: shape.columns,
          domRows: perf.domRows,
          historyChars: shape.historyChars,
        },
      },
      stats,
    );
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copied = false;
      }, 1500);
    } catch {
      // 書き込みが拒否される環境では黙って諦める（表示は変えない）。
    }
  }
</script>

<div class="diag">
  <dl class="scale">
    <div><dt>{t('diag.scale')}</dt><dd>{chars} {t('diag.chars')}</dd></div>
    <div><dt>{t('diag.rows')}</dt><dd>{shape.rows}</dd></div>
    <div><dt>{t('diag.columns')}</dt><dd>{shape.columns}</dd></div>
    <div><dt>{t('diag.domRows')}</dt><dd>{perf.domRows}</dd></div>
    <div><dt>{t('diag.historyChars')}</dt><dd>{shape.historyChars}</dd></div>
  </dl>

  {#if stats.length === 0}
    <p class="empty">{t('diag.empty')}</p>
  {:else}
    <table class="spans">
      <thead>
        <tr>
          <th scope="col">{t('diag.span')}</th>
          <th scope="col">{t('diag.last')}</th>
          <th scope="col">{t('diag.median')}</th>
          <th scope="col">{t('diag.max')}</th>
          <th scope="col">{t('diag.count')}</th>
        </tr>
      </thead>
      <tbody>
        {#each stats as s (s.name)}
          <tr>
            <th scope="row">{t(SPAN_LABEL[s.name])}</th>
            <td>{ms(s.last)}</td>
            <td>{ms(s.median)}</td>
            <td>{ms(s.max)}</td>
            <td class="count">{s.count}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="note">{t('diag.note')}</p>
  {/if}

  <div class="actions">
    <button class="action primary" type="button" onclick={copyReport}>
      {copied ? t('diag.copied') : t('diag.copy')}
    </button>
    <button class="action" type="button" onclick={() => perf.clear()}>{t('diag.clear')}</button>
  </div>
</div>

<style>
  .diag {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    overflow-y: auto;
    min-height: 0;
  }

  .scale {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    font-size: var(--text-xs-size);
  }

  .scale div {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .scale dt {
    color: var(--text-tertiary);
  }

  .scale dd {
    margin: 0;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .spans {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs-size);
  }

  .spans th,
  .spans td {
    padding: var(--space-1) var(--space-2);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .spans thead th {
    color: var(--text-tertiary);
    font-weight: 400;
    border-bottom: 1px solid var(--border);
  }

  /* 区間名だけは数字ではないので左に寄せる。 */
  .spans tbody th {
    text-align: left;
    font-weight: 400;
    color: var(--text-secondary);
  }

  .spans td {
    color: var(--text-primary);
  }

  .spans .count {
    color: var(--text-tertiary);
  }

  .empty,
  .note {
    margin: 0;
    font-size: var(--text-xs-size);
    line-height: 1.6;
    color: var(--text-tertiary);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  .action {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-xs-size);
    cursor: pointer;
  }

  .action:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .action.primary {
    border-color: var(--accent);
    color: var(--text-primary);
  }
</style>
