<script lang="ts">
  // 時系列面。ログを選び、時刻の項目を決め、時刻順に混ぜて出す。
  //
  // 画面の要は「候補を事実として見せない」こと。既定で置いた項目には「推定」と出し、
  // なぜ挙がったか（名前が似ている / 値が読めた）を添える。人が選び直したら印を消す。
  // 突き合わせる項目も同じで、名前が違うものを寄せた場合はそう出す。
  import { timelineView } from '$lib/logs/timelineView.svelte';
  import type { TimeFieldEvidence } from '$lib/logs/fieldCandidates';
  import { t } from '$lib/i18n/i18n.svelte';
  import type { MessageKey } from '$lib/i18n/messages';

  interface Props {
    root: string;
  }
  let { root }: Props = $props();

  const EVIDENCE_LABEL: Record<TimeFieldEvidence, MessageKey> = {
    nameAndValue: 'timeline.evidence.nameAndValue',
    valueOnly: 'timeline.evidence.valueOnly',
    nameOnly: 'timeline.evidence.nameOnly',
  };

  const view = timelineView;
  const plan = $derived(view.plan);
  const result = $derived(view.result);

  /** 中身は 1 行に収める。全部出すと 1 件で画面が埋まる（元の行は出どころから辿れる）。 */
  function digest(record: Record<string, unknown>): string {
    return Object.entries(record)
      .map(([key, value]) => `${key}=${typeof value === 'object' && value !== null ? JSON.stringify(value) : value}`)
      .join('  ');
  }

  function size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
</script>

<div class="timeline">
  <div class="head">
    <span class="title">{t('timeline.head')}</span>
    <button type="button" class="head-btn" onclick={() => view.scan(root)} disabled={view.scanning}>
      {t('timeline.rescan')}
    </button>
    <button type="button" class="head-btn" onclick={() => view.close()}>
      {t('diff.backToPreview')}
    </button>
  </div>

  <div class="body">
    <section class="pick">
      <h3>{t('timeline.files')}</h3>
      {#if view.files.length === 0}
        <p class="hint">{t('timeline.filesEmpty')}</p>
      {:else}
        <ul class="files">
          {#each view.files as file (file.relPath)}
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={view.selected.includes(file.relPath)}
                  onchange={() => view.toggle(file.relPath)}
                />
                <span class="path" title={file.relPath}>{file.relPath}</span>
                <span class="size">{size(file.size)}</span>
              </label>
            </li>
          {/each}
        </ul>
        {#if view.filesTruncated}
          <p class="hint">{t('timeline.filesTruncated')}</p>
        {/if}
      {/if}
      <button
        type="button"
        class="run"
        onclick={() => view.prepare(root)}
        disabled={view.selected.length === 0 || view.preparing}
      >
        {view.preparing ? t('timeline.preparing') : t('timeline.prepare')}
      </button>
    </section>

    {#if plan}
      <section class="fields">
        <h3>{t('timeline.timeField')}</h3>
        <p class="hint">{t('timeline.candidateNote')}</p>
        <ul class="sources">
          {#each plan.sources as source (source.path)}
            <li>
              <span class="path" title={source.path}>{source.path}</span>
              {#if source.error}
                <span class="warn">{t('timeline.unreadable')} — {source.error}</span>
              {:else}
                <input
                  class="field"
                  type="text"
                  value={source.timeField}
                  placeholder={t('timeline.noCandidate')}
                  onchange={(event) => view.setTimeField(source.path, event.currentTarget.value)}
                />
                {#if source.timeField !== ''}
                  <span class="tag" class:guess={!source.confirmed}>
                    {source.confirmed ? t('timeline.chosen') : t('timeline.guess')}
                  </span>
                {/if}
                {#each source.candidates.filter((c) => c.field === source.timeField) as candidate (candidate.field)}
                  <span class="why">
                    {t(EVIDENCE_LABEL[candidate.evidence])}
                    ({t('timeline.parsed', {
                      parsed: candidate.parsed,
                      sampled: candidate.sampled,
                    })})
                  </span>
                {/each}
                {#if source.candidates.length > 0}
                  <span class="others">
                    {#each source.candidates as candidate (candidate.field)}
                      <button
                        type="button"
                        class="pill"
                        aria-pressed={candidate.field === source.timeField}
                        onclick={() => view.setTimeField(source.path, candidate.field)}
                      >
                        {candidate.field}
                      </button>
                    {/each}
                  </span>
                {/if}
                {#if source.skipped > 0}
                  <span class="warn">{t('timeline.skipped', { count: source.skipped })}</span>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>

        {#if plan.joinKeys.length > 0}
          <h3>{t('timeline.joinKey')}</h3>
          <div class="joins">
            <button
              type="button"
              class="pill"
              aria-pressed={plan.joinKey === undefined}
              onclick={() => view.setJoinKey(undefined)}
            >
              {t('timeline.joinNone')}
            </button>
            {#each plan.joinKeys as candidate, index (candidate.fields.map((f) => f.path + f.field).join('|'))}
              <button
                type="button"
                class="pill"
                aria-pressed={plan.joinKey === index}
                onclick={() => view.setJoinKey(index)}
              >
                {candidate.fields[0].field}
                <span class="why">
                  {candidate.exact ? t('timeline.joinExact') : t('timeline.joinNormalized')} /
                  {t('timeline.shared', { count: candidate.sharedValues })}
                </span>
              </button>
            {/each}
          </div>
        {/if}

        <button
          type="button"
          class="run"
          onclick={() => view.build(root)}
          disabled={!plan.ready || view.building}
        >
          {view.building ? t('timeline.building') : t('timeline.build')}
        </button>
      </section>
    {/if}

    {#if view.error}
      <p class="warn error" role="status">{view.error}</p>
    {/if}

    {#if result}
      <section class="events">
        <table>
          <thead>
            <tr>
              <th>{t('timeline.colTime')}</th>
              <th>{t('timeline.colSource')}</th>
              <th class="num">{t('timeline.colLine')}</th>
              <th>{t('timeline.colRecord')}</th>
            </tr>
          </thead>
          <tbody>
            {#each result.events as event, index (event.path + ':' + event.line + ':' + index)}
              <tr data-mark={view.marks[index] === undefined ? undefined : view.marks[index] % 6}>
                <td class="time" class:unknown={event.time === null}>
                  {event.time ?? t('timeline.unknownTime')}
                </td>
                <td class="src" title={event.path}>{event.source}</td>
                <td class="num">{event.line}</td>
                <td class="rec" title={digest(event.record)}>{digest(event.record)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="hint foot">
          {#if result.truncated}<span class="warn">{t('timeline.truncated')}</span>{/if}
          {#if result.unknownTime > 0}
            <span>{t('timeline.unknownCount', { count: result.unknownTime })}</span>
          {/if}
          <span>{t('timeline.maskedNote')}</span>
        </p>
      </section>
    {:else if !view.error}
      <p class="hint">{t('timeline.empty')}</p>
    {/if}
  </div>
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg-app);
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  .title {
    flex: 1;
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
  }

  .head-btn,
  .run,
  .pill {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-size: var(--text-xs-size);
    padding: 2px var(--space-2);
    cursor: pointer;
  }

  .head-btn:hover,
  .run:hover,
  .pill:hover {
    background: var(--bg-hover);
  }

  .run:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .pill[aria-pressed='true'] {
    background: var(--bg-selected, var(--bg-hover));
    border-color: var(--accent, var(--border-strong));
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  h3 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
    font-weight: 600;
  }

  .hint {
    margin: 0;
    font-size: var(--text-2xs-size, 10px);
    color: var(--text-secondary);
  }

  .files,
  .sources {
    list-style: none;
    margin: 0 0 var(--space-2);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .files label,
  .sources li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs-size);
  }

  .path {
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .files .path {
    flex: 1;
  }

  .sources .path {
    min-width: 8rem;
    max-width: 14rem;
  }

  .size {
    color: var(--text-secondary);
    font-size: var(--text-2xs-size, 10px);
  }

  .field {
    width: 10rem;
    font-family: var(--font-mono);
    font-size: var(--text-xs-size);
    padding: 1px var(--space-1);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .tag {
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    font-size: var(--text-2xs-size, 10px);
  }

  /* 推定と選択済みを見た目で分ける。同じ見た目にすると候補が事実として通る。 */
  .tag.guess {
    border: 1px dashed var(--border-strong);
    color: var(--text-secondary);
  }

  .why,
  .others {
    display: inline-flex;
    gap: var(--space-1);
    align-items: center;
    font-size: var(--text-2xs-size, 10px);
    color: var(--text-secondary);
  }

  .joins {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .warn {
    color: var(--danger, #c0392b);
    font-size: var(--text-2xs-size, 10px);
  }

  .error {
    font-size: var(--text-xs-size);
  }

  .events {
    min-width: 0;
    overflow-x: auto;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--text-xs-size);
  }

  th,
  td {
    text-align: left;
    padding: 1px var(--space-2);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  th {
    color: var(--text-secondary);
    font-weight: 600;
    position: sticky;
    top: 0;
    background: var(--bg-app);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .time,
  .rec,
  .src {
    font-family: var(--font-mono);
  }

  .time.unknown {
    color: var(--text-secondary);
  }

  .rec {
    max-width: 60ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 突き合わせた値のまとまり。色は 6 通りで回す（多すぎると見分けが付かない）。 */
  tr[data-mark] td:first-child {
    border-left: 3px solid transparent;
  }
  tr[data-mark='0'] td:first-child {
    border-left-color: #3b82f6;
  }
  tr[data-mark='1'] td:first-child {
    border-left-color: #10b981;
  }
  tr[data-mark='2'] td:first-child {
    border-left-color: #f59e0b;
  }
  tr[data-mark='3'] td:first-child {
    border-left-color: #a855f7;
  }
  tr[data-mark='4'] td:first-child {
    border-left-color: #ec4899;
  }
  tr[data-mark='5'] td:first-child {
    border-left-color: #14b8a6;
  }

  .foot {
    display: flex;
    gap: var(--space-2);
    padding-top: var(--space-1);
  }
</style>
