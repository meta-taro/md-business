<script lang="ts">
  /**
   * 出す前の下見。
   *
   * 何が出るのかを、押す前に読める形で出す。押した後に取り消せないので、
   * 「置き先・どの名前で・何が変わるか」の 3 つは黙って進めない。
   *
   * 記録に残すのは、ここに並べた分だけ。並べた後に増えたものは混ぜない。
   */
  import { t } from '$lib/i18n/i18n.svelte';
  import { publish } from '$lib/preview/publishController.svelte';
  import type { PublishPlan } from '$lib/git/publishPlan';
  import type { SiteExportResult } from '$lib/preview/siteExportController.svelte';

  /** 一覧に並べる上限。これを超えた分は件数だけ出す（下見が読めない長さになる）。 */
  const LIST_MAX = 10;

  const { plan, build }: { plan: PublishPlan; build: SiteExportResult | null } = $props();

  let message = $state(t('publish.defaultMessage'));

  /** 組み立ての結果。同意が無いときは出せない（本文が入らないまま出る）。 */
  const blocked = $derived(build?.kind === 'consent');

  const buildNote = $derived.by(() => {
    if (build === null) return null;
    if (build.kind === 'consent') return t('action.siteConsent');
    if (build.kind === 'none') return t('action.siteNone');
    if (build.kind === 'done') return t('publish.built', { count: build.count });
    return null;
  });

  /** 出せない理由。ready なら null。 */
  const reason = $derived.by(() => {
    switch (plan.kind) {
      case 'no-repo':
        return t('publish.noRepo');
      case 'no-remote':
        return t('publish.noRemote');
      case 'detached':
        return t('publish.detached');
      case 'conflicted':
        return t('publish.conflicted', { paths: plan.paths.join(', ') });
      case 'behind':
        return t('publish.behind', { count: plan.behind });
      case 'nothing':
        return t('publish.nothing');
      default:
        return null;
    }
  });

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      publish.cancel();
    }
  }
</script>

<button class="backdrop" type="button" aria-label={t('publish.cancel')} onclick={() => publish.cancel()}
></button>

<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-label={t('publish.dialogTitle')}
  tabindex="-1"
  onkeydown={onKeydown}
>
  <h2 class="title">{t('publish.dialogTitle')}</h2>

  {#if buildNote !== null}
    <p class="note" class:is-warn={blocked}>{buildNote}</p>
  {/if}

  {#if plan.kind === 'ready'}
    <dl class="rows">
      <dt>{t('publish.remote')}</dt>
      <dd class="path">{plan.remote}</dd>

      <dt>{t('publish.branch')}</dt>
      <dd>
        {plan.branch}
        {#if !plan.hasUpstream}
          <!-- まだ置き先に無い名前。押すと作られることを、押す前に言っておく。 -->
          <span class="sub">{t('publish.branchNew')}</span>
        {/if}
      </dd>

      <dt>{t('publish.changed', { count: plan.paths.length })}</dt>
      <dd>
        {#if plan.paths.length === 0}
          <span class="sub">—</span>
        {:else}
          <ul class="list">
            {#each plan.paths.slice(0, LIST_MAX) as path (path)}
              <li>{path}</li>
            {/each}
          </ul>
          {#if plan.paths.length > LIST_MAX}
            <span class="sub">{t('publish.more', { count: plan.paths.length - LIST_MAX })}</span>
          {/if}
        {/if}
      </dd>

      {#if plan.pending.length > 0}
        <dt>{t('publish.pending', { count: plan.pending.length })}</dt>
        <dd>
          <ul class="list">
            {#each plan.pending.slice(0, LIST_MAX) as subject, index (index)}
              <li>{subject}</li>
            {/each}
          </ul>
          {#if plan.pending.length > LIST_MAX}
            <span class="sub">{t('publish.more', { count: plan.pending.length - LIST_MAX })}</span>
          {/if}
        </dd>
      {/if}

      {#if plan.paths.length > 0}
        <dt><label for="publish-message">{t('publish.message')}</label></dt>
        <dd>
          <input id="publish-message" class="input" type="text" bind:value={message} />
        </dd>
      {/if}
    </dl>
  {:else}
    <p class="note is-warn">{reason}</p>
  {/if}

  <div class="actions">
    <button class="btn" type="button" onclick={() => publish.cancel()}>
      {t('publish.cancel')}
    </button>
    {#if plan.kind === 'ready' && !blocked}
      <button
        class="btn is-primary"
        type="button"
        disabled={publish.busy || message.trim() === ''}
        onclick={() => void publish.publish(message.trim())}
      >
        {publish.busy ? t('publish.publishing') : t('publish.confirm')}
      </button>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    border: none;
    background: rgb(0 0 0 / 0.35);
    cursor: default;
  }

  .dialog {
    position: fixed;
    z-index: 101;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 2 * var(--space-4)));
    max-height: calc(100vh - 2 * var(--space-4));
    overflow-y: auto;
    padding: var(--space-4);
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
  }

  .title {
    margin: 0 0 var(--space-3);
    font-size: var(--text-base-size, 14px);
    font-weight: 700;
    color: var(--text-primary);
  }

  .note {
    margin: 0 0 var(--space-3);
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
  }

  .note.is-warn {
    color: var(--text-primary);
  }

  .rows {
    display: grid;
    grid-template-columns: minmax(auto, 10em) 1fr;
    gap: var(--space-2) var(--space-3);
    margin: 0 0 var(--space-4);
    font-size: var(--text-sm-size);
  }

  .rows dt {
    color: var(--text-tertiary);
    font-size: var(--text-xs-size);
    align-self: start;
  }

  .rows dd {
    margin: 0;
    color: var(--text-primary);
    min-width: 0;
    word-break: break-word;
  }

  .path {
    color: var(--text-secondary);
    word-break: break-all;
  }

  .sub {
    display: block;
    color: var(--text-tertiary);
    font-size: var(--text-xs-size);
  }

  .list {
    margin: 0;
    padding: 0 0 0 var(--space-3);
    list-style: disc;
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
    word-break: break-all;
  }

  .input {
    width: 100%;
    height: 26px;
    padding: 0 var(--space-2);
    background: var(--bg-base);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: inherit;
    font-size: var(--text-sm-size);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .btn {
    height: 28px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font-family: inherit;
    font-size: var(--text-sm-size);
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* 出す側だけ色を持たせる。並べた 2 つのうち、後戻りできないのはこちらだけなので。 */
  .btn.is-primary {
    color: var(--accent);
    background: var(--accent-subtle);
    border-color: var(--accent-border);
  }
</style>
