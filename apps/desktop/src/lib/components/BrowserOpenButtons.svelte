<script lang="ts">
  /**
   * 出しているページを、この PC に入っているブラウザで開くボタン。
   *
   * **プレビューの見出しに置く。**作っている最中に見る場所はここなので、
   * 「別の窓でも見る」ボタンが目の届く範囲に無いと、あることに気づかれない。
   *
   * 入っていないブラウザは並べない。押しても何も起きないボタンになる
   * （起動を頼んだ先が無いことは、頼んだ側からは分からない）。
   */
  import { browserPreview, type BrowserChoice } from '$lib/preview/browserPreviewController.svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  interface Props {
    /** 開いているフォルダ。無ければ出さない。 */
    root: string | null;
  }

  const { root }: Props = $props();

  /** ボタンに出す名前。製品の名前なので訳さない。 */
  const LABEL: Record<BrowserChoice, string> = {
    default: '',
    chrome: 'Chrome',
    edge: 'Edge',
  };
</script>

{#if root !== null && browserPreview.installed.length > 0}
  <div class="browsers">
    {#each browserPreview.installed as choice (choice)}
      <button
        type="button"
        class="browser-btn"
        class:is-live={browserPreview.serving !== null}
        disabled={browserPreview.busy}
        title={t('action.openInBrowser', { name: LABEL[choice] })}
        onclick={() => void browserPreview.openIn(root, choice)}
      >
        <!-- 窓の形。製品の記章は使わない（商標であって、見分けに要るのは名前のほう）。 -->
        <svg class="browser-ico" viewBox="0 0 16 16" aria-hidden="true">
          <rect
            x="1.6"
            y="2.6"
            width="12.8"
            height="10.8"
            rx="1.6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
          <path d="M1.6 6h12.8" fill="none" stroke="currentColor" stroke-width="1.2" />
          <circle cx="4" cy="4.3" r="0.7" fill="currentColor" />
          <circle cx="6.2" cy="4.3" r="0.7" fill="currentColor" />
        </svg>
        {LABEL[choice]}
      </button>
    {/each}
  </div>
{/if}

<style>
  .browsers {
    /* 見出しの右端へ寄せる。左は今どの文書を見ているかの名前なので、そちらを押しのけない。 */
    margin-left: auto;
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  /* 見出しのほかのボタンより一段だけ色を持たせる。押す回数が桁違いに多いので、
     並んだ中から探させない。強い色にしないのは、見出しが本文より目立つと
     読む面としての落ち着きが無くなるため。 */
  .browser-btn {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 var(--space-3);
    font-size: var(--text-2xs-size);
    font-weight: var(--text-2xs-weight);
    letter-spacing: 0.02em;
    color: var(--accent);
    background: var(--accent-subtle);
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--dur-fast, 120ms) ease,
      border-color var(--dur-fast, 120ms) ease,
      color var(--dur-fast, 120ms) ease;
  }

  .browser-btn:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .browser-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* 出している最中は枠を濃くする。押せば「開く」だけで、立て直さないことの合図。 */
  .browser-btn.is-live {
    border-color: var(--accent);
  }

  .browser-ico {
    width: 14px;
    height: 14px;
    flex: none;
  }
</style>
