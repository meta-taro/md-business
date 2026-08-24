<script lang="ts">
  // web モードを宣言しているフォルダを、この PC で動かしてよいか尋ねる。
  //
  // ここで押した結果はこの PC に残り、プロジェクト側からは書けない。宣言（md-business.yml）は
  // フォルダの中にあって誰でも書き換えられるので、それだけでは動かない。押すところが要るのは
  // そのためで、押されるまでは待ち受けを立てない。
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    root,
    origins,
    onallow,
    oncancel,
  }: {
    /** 尋ねている対象のフォルダ。 */
    root: string;
    /** 宣言されている、プロジェクト以外からの取り寄せ先。 */
    origins: string[];
    onallow: () => void;
    oncancel: () => void;
  } = $props();

  /** 開いた直後は「やめる」側に入れる。何も押さずに Enter を叩いても動き出さない。 */
  function focusCancel(node: HTMLButtonElement): void {
    node.focus();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    oncancel();
  }
</script>

<!-- 外側クリックは「やめる」。押していないものを押したことにしない。 -->
<button class="backdrop" type="button" aria-label={t('trust.cancel')} onclick={oncancel}></button>

<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-label={t('trust.title')}
  tabindex="-1"
  onkeydown={onKeydown}
>
  <h2 class="title">{t('trust.title')}</h2>

  <p class="body">{t('trust.body')}</p>

  <p class="row">
    <span class="row-label">{t('trust.folder')}</span>
    <span class="row-value">{root}</span>
  </p>

  <!-- 取り寄せ先は許可の中身そのものなので、宣言されていなくても「無い」と書く。 -->
  <p class="row">
    <span class="row-label">{t('trust.origins')}</span>
    <span class="row-value">
      {origins.length === 0 ? t('trust.originsNone') : origins.join(' / ')}
    </span>
  </p>

  <p class="note">{t('trust.note')}</p>

  <div class="actions">
    <button class="btn" type="button" onclick={oncancel} use:focusCancel>
      {t('trust.cancel')}
    </button>
    <button class="btn primary" type="button" onclick={onallow}>
      {t('trust.allow')}
    </button>
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
    width: min(440px, calc(100vw - 2 * var(--space-4)));
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

  .body {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm-size);
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin: 0 0 var(--space-2);
    font-size: var(--text-xs-size);
  }

  .row-label {
    flex: none;
    color: var(--text-tertiary);
  }

  .row-value {
    color: var(--text-secondary);
    word-break: break-all;
  }

  .note {
    margin: var(--space-3) 0;
    font-size: var(--text-2xs-size, 10px);
    color: var(--text-tertiary);
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

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg, #fff);
  }
</style>
