<script lang="ts">
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { LOCALES, LOCALE_LABELS, isLocale } from '$lib/i18n/locales';

  // 言語セレクタ。TopBar のアクション群に並ぶ小さなプルダウン。選択で即時に UI 全体の
  // 文言が切り替わる（i18n.set がラン状態を更新 → t() を参照する全コンポーネントが再描画）。
  function onChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (isLocale(value)) i18n.set(value);
  }
</script>

<label class="lang" title={t('lang.label')}>
  <span class="sr-only">{t('lang.label')}</span>
  <!-- 地球儀アイコン（言語の普遍記号）。currentColor 追従でテーマに馴染む。 -->
  <svg class="lang-ico" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.2" />
    <path
      d="M1.6 8h12.8M8 1.6c1.9 2 1.9 10.8 0 12.8M8 1.6c-1.9 2-1.9 10.8 0 12.8"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
    />
  </svg>
  <select class="lang-select" value={i18n.locale} onchange={onChange} aria-label={t('lang.label')}>
    {#each LOCALES as locale (locale)}
      <option value={locale}>{LOCALE_LABELS[locale]}</option>
    {/each}
  </select>
</label>

<style>
  .lang {
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-2);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    transition: background var(--dur-fast) var(--ease);
  }

  .lang:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .lang-ico {
    width: 15px;
    height: 15px;
    flex: none;
  }

  .lang-select {
    appearance: none;
    border: none;
    background: transparent;
    color: inherit;
    font-size: var(--text-sm-size);
    cursor: pointer;
    padding: 0 var(--space-1);
    /* option のドロップダウンはネイティブ描画。地の色はテーマ変数で。 */
  }

  .lang-select:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
    border-radius: var(--radius-sm);
  }

  /* ネイティブ option の可読性（ダーク時に白地白文字を避ける）。 */
  .lang-select option {
    background: var(--bg-app);
    color: var(--text-primary);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
