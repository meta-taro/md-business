<script lang="ts">
  import { onMount } from 'svelte';
  import { titlebarController } from '$lib/window/titlebar.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { documentDisplayName } from '$lib/window/docTitle';
  import { t } from '$lib/i18n/i18n.svelte';

  // フレームレス（decorations:false）のため、この TopBar 自体が OS タイトルバーを兼ねる。
  // 押せるものは右端のウィンドウ操作だけに絞り、残りは 2 行目の MenuBar へ降ろした。
  // ヘッダー地＝ドラッグ領域（data-tauri-drag-region）。.lead / .center は
  // pointer-events:none で地に貫通させ、どこを掴んでも窓を動かせる。
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
    /* 左右を等分の 1fr にして中央列（文書名）を窓の中央へ置く。ただし素の 1fr は
       min-content を下回れないため、幅が足りなくなるとトラックが帯からはみ出し、
       中央寄せの文書名と右のウィンドウ操作が重なる。左と中央は 0 まで縮められるように、
       右はウィンドウ操作の min-content を下限にして、詰まったときは
       「左が縮む → 文書名が … で省略される」の順に潰れるようにする。 */
    grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(min-content, 1fr);
    align-items: center;
    gap: var(--space-3);
    /* 右端はウィンドウコントロールを角まで寄せるため padding を持たない */
    padding: 0 0 0 var(--space-4);
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }

  /* 地に貫通させてドラッグ可能に（ウィンドウ操作は .right 側で pointer-events 有効） */
  .lead,
  .center {
    pointer-events: none;
  }

  .lead {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    /* 縮んだときにブランド名が中央列へはみ出さないよう切り落とす。 */
    overflow: hidden;
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
    white-space: nowrap;
  }

  .center {
    /* justify-self: center は要素を内容幅のまま中央に置くため、トラックより広いと
       そのまま溢れて右のアクション群へ重なる。トラックいっぱいに広げたうえで
       中身を中央寄せし、狭いときは文書名が … で省略されるようにする。 */
    justify-self: stretch;
    justify-content: center;
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
    /* min-width は詰めない。ここを 0 にすると min-content が 0 と評価され、
       .topbar のトラック下限（minmax(min-content, 1fr)）が効かなくなる。 */
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
