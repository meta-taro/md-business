<script lang="ts">
  // 検証シートの新規作成ダイアログ。
  // 「どのフォルダに」「どのひな形で」「どういう名前で」の 3 つだけを聞き、本文は列プリセット
  // （tsvPresets の純関数・テスト済み）に作らせる。書き込みは呼び出し元へ返し、ここは入力と
  // 見せ方だけを持つ。作成後にファイルを開くところまでがストアの責務。
  import { t } from '$lib/i18n/i18n.svelte';
  import { TSV_PRESETS, buildPresetTsv, presetFileName, findPreset } from '$lib/tsv/tsvPresets';

  let {
    folderPath,
    onclose,
    oncreate,
  }: {
    /** 作成先フォルダの相対パス（ルート直下は空文字）。 */
    folderPath: string;
    onclose: () => void;
    /** ファイル名（拡張子込み）と本文を渡す。失敗理由は throw で返してもらう。 */
    oncreate: (name: string, content: string) => Promise<void>;
  } = $props();

  let presetId = $state(TSV_PRESETS[0].id);
  let fileName = $state('');
  let sheetTitle = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  const preset = $derived(findPreset(presetId) ?? TSV_PRESETS[0]);
  // 空のままでは拡張子だけの名前になるので、押せるのは名前を入れてから。
  const canCreate = $derived(fileName.trim() !== '' && !busy);

  /** 開いた直後に名前へ入れる（ひな形は既定のまま作ることが多い）。 */
  function focusName(node: HTMLInputElement): void {
    node.focus();
  }

  async function submit(): Promise<void> {
    if (!canCreate) return;
    busy = true;
    error = null;
    try {
      await oncreate(presetFileName(fileName), buildPresetTsv(preset, sheetTitle));
      onclose();
    } catch (e) {
      // 同名が既にある場合など、Rust 側の Err をそのまま出す（閉じると理由が見えなくなる）。
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    // 変換確定の Enter を作成と取り違えない。
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
</script>

<!-- 外側クリックで閉じる。作成前なので失われるのは入力途中の 3 項目だけ。 -->
<button class="backdrop" type="button" aria-label={t('newSheet.cancel')} onclick={onclose}></button>

<!-- Enter / Esc は中のどの入力欄からでも効かせたいので、キー入力は枠で受ける。 -->
<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-label={t('newSheet.title')}
  tabindex="-1"
  onkeydown={onKeydown}
>
  <h2 class="title">{t('newSheet.title')}</h2>

  <p class="where">
    <span class="where-label">{t('newSheet.folder')}</span>
    <span class="where-path">{folderPath === '' ? t('newSheet.folderRoot') : folderPath}</span>
  </p>

  <fieldset class="presets">
    <legend class="label">{t('newSheet.preset')}</legend>
    {#each TSV_PRESETS as p (p.id)}
      <label class="preset" class:on={p.id === presetId}>
        <input type="radio" name="preset" value={p.id} bind:group={presetId} disabled={busy} />
        <span class="preset-text">
          <span class="preset-name">{t(p.labelKey)}</span>
          <span class="preset-desc">{t(p.descriptionKey)}</span>
          <!-- 何の列ができるかは名前だけでは伝わらないので、生成する列名をそのまま見せる。 -->
          <span class="preset-cols">{p.columns.map((c) => c.name).join(' / ')}</span>
        </span>
      </label>
    {/each}
  </fieldset>

  <label class="field">
    <span class="label">{t('newSheet.fileName')}</span>
    <input
      class="input"
      type="text"
      bind:value={fileName}
      placeholder={t('newSheet.fileNamePlaceholder')}
      disabled={busy}
      use:focusName
      oninput={() => (error = null)}
    />
    <span class="hint">{t('newSheet.fileNameHint')}</span>
  </label>

  <label class="field">
    <span class="label">{t('newSheet.sheetTitle')}</span>
    <input
      class="input"
      type="text"
      bind:value={sheetTitle}
      placeholder={t('newSheet.sheetTitlePlaceholder')}
      disabled={busy}
    />
  </label>

  {#if error !== null}
    <p class="error">{error}</p>
  {/if}

  <div class="actions">
    <button class="btn" type="button" onclick={onclose} disabled={busy}>
      {t('newSheet.cancel')}
    </button>
    <button class="btn primary" type="button" onclick={submit} disabled={!canCreate}>
      {t('newSheet.create')}
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

  .where {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin: 0 0 var(--space-3);
    font-size: var(--text-xs-size);
  }

  .where-label {
    color: var(--text-tertiary);
    flex: none;
  }

  .where-path {
    color: var(--text-secondary);
    word-break: break-all;
  }

  .presets {
    margin: 0 0 var(--space-3);
    padding: 0;
    border: none;
  }

  .label {
    display: block;
    padding: 0;
    margin-bottom: var(--space-1);
    font-size: var(--text-xs-size);
    color: var(--text-tertiary);
  }

  .preset {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }

  .preset + .preset {
    margin-top: var(--space-1);
  }

  .preset.on {
    border-color: var(--accent);
    background: var(--bg-hover, transparent);
  }

  .preset input {
    margin-top: 2px;
    flex: none;
  }

  .preset-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .preset-name {
    font-size: var(--text-sm-size);
    color: var(--text-primary);
  }

  .preset-desc {
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
  }

  .preset-cols {
    font-size: var(--text-2xs-size, 10px);
    color: var(--text-tertiary);
    word-break: break-word;
  }

  .field {
    display: block;
    margin-bottom: var(--space-3);
  }

  .input {
    display: block;
    width: 100%;
    height: 28px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-base, transparent);
    color: var(--text-primary);
    font-family: inherit;
    font-size: var(--text-sm-size);
  }

  .input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .hint {
    display: block;
    margin-top: 2px;
    font-size: var(--text-2xs-size, 10px);
    color: var(--text-tertiary);
  }

  .error {
    margin: 0 0 var(--space-3);
    color: var(--danger-fg, #c7502f);
    font-size: var(--text-xs-size);
    white-space: pre-wrap;
    word-break: break-word;
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

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg, #fff);
  }
</style>
