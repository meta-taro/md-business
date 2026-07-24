<script lang="ts">
  import { onMount } from 'svelte';
  import { themeController } from '$lib/theme.svelte';
  import { titlebarController } from '$lib/window/titlebar.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { pdfExport } from '$lib/preview/pdfExport.svelte';
  import { documentDisplayName } from '$lib/window/docTitle';
  import { t } from '$lib/i18n/i18n.svelte';
  import HelpButton from './HelpButton.svelte';
  import LanguageSelect from './LanguageSelect.svelte';

  // フレームレス（decorations:false）のため、この TopBar 自体が OS タイトルバーを兼ねる。
  // ヘッダー地＝ドラッグ領域（data-tauri-drag-region）、右端に自作のウィンドウコントロール。
  // .lead / .center は pointer-events:none で地に貫通させ、どこを掴んでも窓を動かせる。
  // ボタン群（.right 配下）は pointer-events 有効＝クリック可能。
  onMount(() => {
    titlebarController.init();
  });

  // 中央の表示名。文書種別が判るときは frontmatter / TSV メタから意味のある名前を組み、
  // 該当しなければファイル名（相対パス末尾）へフォールバック（docTitle 純ロジック）。未オープンは案内文。
  const docName = $derived.by(() => {
    if (workspace.activePath === null) return t('app.docPlaceholder');
    const fileName = workspace.activePath.split('/').pop() ?? workspace.activePath;
    return documentDisplayName(workspace.source, fileName);
  });
</script>

<header class="topbar" data-tauri-drag-region>
  <div class="lead">
    <span class="brand-dot" aria-hidden="true"></span>
    <span class="brand">md-business</span>
  </div>

  <div class="center">
    {#if workspace.dirty}
      <!-- 未保存の印（VSCode 風の白丸）。data-tauri-drag-region 内なので装飾のみ。 -->
      <span class="dirty-dot" title={t('app.unsavedLong')} aria-label={t('app.unsaved')}></span>
    {/if}
    <span class="doc-title" class:is-dirty={workspace.dirty}>{docName}</span>
  </div>

  <div class="right">
    <div class="actions">
      <!-- 保存（Ctrl+S / ⌘S と等価）。未オープン / 未変更 / 保存中は不活性。
           フロッピー＝保存の普遍アイコン（拡張子非依存で意味が通る）。 -->
      <button
        class="btn ghost with-icon"
        type="button"
        onclick={() => workspace.save()}
        disabled={!workspace.canSave}
        title={workspace.saving ? t('action.saving') : t('action.saveTitle')}
        aria-label={t('action.save')}
      >
        <svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M2.75 1.75h7.5L14.25 5.5v8.25a.5.5 0 0 1-.5.5H2.75a.5.5 0 0 1-.5-.5V2.25a.5.5 0 0 1 .5-.5z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
          <path
            d="M5 1.75v3.25h4.5V1.75"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
          <rect
            x="4.5"
            y="8.75"
            width="7"
            height="5"
            rx="0.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
        </svg>
        <span>{workspace.saving ? t('action.saving') : t('action.save')}</span>
      </button>
      <!-- PDF 出力（§6.4・Ctrl+P / ⌘P と等価）。プレビュー描画中だけ活性。押すと
           WebView の印刷（→「PDF として保存」）でプレビュー見た目のまま A4 出力する。
           プリンタ＝印刷の普遍アイコン。 -->
      <button
        class="btn ghost with-icon"
        type="button"
        onclick={() => pdfExport.run()}
        disabled={!pdfExport.canExport}
        title={t('action.pdfTitle')}
        aria-label={t('action.pdf')}
      >
        <svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 6V2.25h8V6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
          <path
            d="M4 11.5H2.75A1.25 1.25 0 0 1 1.5 10.25V7.5A1.25 1.25 0 0 1 2.75 6.25h10.5A1.25 1.25 0 0 1 14.5 7.5v2.75A1.25 1.25 0 0 1 13.25 11.5H12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
          <rect
            x="4"
            y="9.75"
            width="8"
            height="4.5"
            rx="0.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
          <circle cx="11.9" cy="8.1" r="0.7" fill="currentColor" />
        </svg>
        <span>PDF</span>
      </button>
      <!-- テーマ切替（保存 / PDF と同じアイコン + ラベル体裁に統一）。現在テーマを表す線画を出す。
           ダーク時は月・ライト時は太陽。押すと反対テーマへ切替。 -->
      <button
        class="btn ghost with-icon"
        type="button"
        onclick={() => themeController.toggle()}
        title={themeController.value === 'dark' ? t('action.themeToLight') : t('action.themeToDark')}
        aria-label={t('action.theme')}
      >
        {#if themeController.value === 'dark'}
          <svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M13 9.6A5.4 5.4 0 1 1 6.4 3a4.3 4.3 0 0 0 6.6 6.6z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linejoin="round"
            />
          </svg>
        {:else}
          <svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.2" />
            <path
              d="M8 1.4v1.8M8 12.8v1.8M1.4 8h1.8M12.8 8h1.8M3.3 3.3l1.27 1.27M11.43 11.43l1.27 1.27M12.7 3.3l-1.27 1.27M4.57 11.43L3.3 12.7"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            />
          </svg>
        {/if}
        <span>{t('action.theme')}</span>
      </button>
      <LanguageSelect />
      <HelpButton />
    </div>

    <div class="window-controls">
      <button
        class="wc"
        type="button"
        onclick={() => titlebarController.minimize()}
        title={t('window.minimize')}
        aria-label={t('window.minimize')}
      >
        ─
      </button>
      <button
        class="wc"
        type="button"
        onclick={() => titlebarController.toggleMaximize()}
        title={titlebarController.isMaximized ? t('window.restore') : t('window.maximize')}
        aria-label={titlebarController.isMaximized ? t('window.restore') : t('window.maximize')}
      >
        {titlebarController.maxGlyph}
      </button>
      <button
        class="wc close"
        type="button"
        onclick={() => titlebarController.close()}
        title={t('window.close')}
        aria-label={t('window.close')}
      >
        ✕
      </button>
    </div>
  </div>
</header>

<style>
  .topbar {
    height: var(--topbar-h);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-3);
    /* 右端はウィンドウコントロールを角まで寄せるため padding を持たない */
    padding: 0 0 0 var(--space-4);
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }

  /* 地に貫通させてドラッグ可能に（ボタンは .right 側で pointer-events 有効） */
  .lead,
  .center {
    pointer-events: none;
  }

  .lead {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .brand-dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-full);
    background: var(--accent-gradient);
    flex: none;
  }

  .brand {
    font-size: var(--text-sm-size);
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: var(--tracking-tight);
  }

  .center {
    justify-self: center;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .doc-title {
    font-size: var(--text-sm-size);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .doc-title.is-dirty {
    color: var(--text-primary);
  }

  /* 未保存インジケータ。開いた文書に差分があるときだけ点灯する。 */
  .dirty-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--accent);
    flex: none;
  }

  .right {
    justify-self: end;
    align-self: stretch;
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding-right: var(--space-2);
  }

  .btn {
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  /* アイコン + ラベルのアクション（保存 / PDF / テーマ / ヘルプ）。線画 SVG は currentColor
     追従でテーマに馴染む。ラベルは残し、業務ユーザーに動作を明示する。 */
  .btn.with-icon {
    gap: var(--space-1);
  }

  .btn-ico {
    width: 15px;
    height: 15px;
    flex: none;
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
    color: var(--text-primary);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* ── ウィンドウコントロール（Windows 慣習：右上角に密着・フル高） ── */
  .window-controls {
    display: flex;
    align-items: stretch;
    align-self: stretch;
  }

  .wc {
    width: 46px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .wc:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .wc.close:hover {
    background: var(--danger-fg);
    color: #ffffff;
  }

  .wc:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
    color: var(--text-primary);
  }
</style>
