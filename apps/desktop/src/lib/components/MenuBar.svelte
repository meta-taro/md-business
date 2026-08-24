<script lang="ts">
  import { themeController } from '$lib/theme.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { autosave } from '$lib/workspace/autosave.svelte';
  import { pdfExport } from '$lib/preview/pdfExport.svelte';
  import { htmlExport } from '$lib/preview/htmlExportController.svelte';
  import {
    imageExport,
    type ImageExportResult,
  } from '$lib/preview/imageExportController.svelte';
  import {
    IMAGE_PRESETS,
    type ImageFormatChoice,
    type ImagePresetName,
  } from '$lib/preview/imageExport';
  import {
    siteExport,
    type SiteExportResult,
  } from '$lib/preview/siteExportController.svelte';
  import {
    browserPreview,
    type BrowserPreviewNotice,
  } from '$lib/preview/browserPreviewController.svelte';
  import { onMount } from 'svelte';
  import TrustDialog from './TrustDialog.svelte';
  import { timelineView } from '$lib/logs/timelineView.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import {
    MENU_IDS,
    itemsOf,
    isItemEnabled,
    itemToggleState,
    nextMenuId,
    type MenuCaps,
    type MenuId,
    type MenuItemId,
  } from './menuBar';
  import HelpButton from './HelpButton.svelte';
  import LanguageSelect from './LanguageSelect.svelte';

  // 操作を言葉のメニューへ収める行。上の行（TopBar）は窓を掴む場所に戻したので、
  // 押せるものはここと、右端のウィンドウ操作だけになる。
  //
  // 開いている間はこの行の上をなぞるだけで隣のメニューへ移る（表計算やエディタの作法）。
  // 開いていないときになぞっても開かない。掴んで窓を動かすたびに開くのは邪魔なので。
  // この PC に何が入っているかは、画面ができてから 1 回だけ調べる。起動を待たせない。
  // 調べた結果を使うボタンはプレビューの見出しにあるが、そちらは開いている文書によって
  // 出たり消えたりするので、常にある行のほうから 1 回だけ調べる。
  onMount(() => void browserPreview.detectBrowsers());

  let openMenu = $state<MenuId | null>(null);
  const buttons: Partial<Record<MenuId, HTMLButtonElement>> = {};

  const caps = $derived<MenuCaps>({
    loading: workspace.loading,
    hasRoot: workspace.root !== null,
    canSave: workspace.canSave,
    autosaveOn: autosave.enabled,
    canPdf: pdfExport.canExport,
    canHtml: htmlExport.canExport,
    canImage: imageExport.canExport,
    imagePicking: imageExport.picking,
    canSite: siteExport.canExport,
    browserBusy: browserPreview.busy,
    browserServing: browserPreview.serving !== null,
    timelineOpen: timelineView.active,
  });

  function menuLabel(menu: MenuId): string {
    if (menu === 'file') return t('menu.file');
    if (menu === 'export') return t('menu.export');
    return t('menu.view');
  }

  function itemLabel(item: MenuItemId): string {
    switch (item) {
      case 'openFolder':
        return t('tree.openFolder');
      case 'save':
        return workspace.saving ? t('action.saving') : t('action.save');
      case 'autosave':
        return t('action.autosave');
      case 'pdf':
        return t('action.pdf');
      case 'html':
        return t('action.html');
      case 'image':
        return t('action.image');
      case 'site':
        return t('action.site');
      case 'browser':
        return t('action.browser');
      case 'theme':
        // 押した先を書く。今どちらかは画面の明暗そのものを見れば分かる。
        return themeController.value === 'dark' ? t('action.themeToLight') : t('action.themeToDark');
      case 'timeline':
        return t('timeline.open');
      case 'language':
        return t('lang.label');
    }
  }

  function runItem(item: MenuItemId): void {
    openMenu = null;
    switch (item) {
      case 'openFolder':
        void workspace.openFolder();
        return;
      case 'save':
        void workspace.save();
        return;
      case 'autosave':
        autosave.toggle();
        return;
      case 'pdf':
        pdfExport.run();
        return;
      case 'html':
        void htmlExport.run();
        return;
      case 'image':
        // 何を撮るかを選ぶ欄が、書き出しメニューの位置から下へ出る。
        imageExport.toggle();
        return;
      case 'site':
        void siteExport.run();
        return;
      case 'browser':
        if (browserPreview.serving === null) {
          if (workspace.root !== null) void browserPreview.start(workspace.root);
        } else {
          void browserPreview.stop();
        }
        return;
      case 'theme':
        themeController.toggle();
        return;
      case 'timeline':
        if (timelineView.active) timelineView.close();
        else if (workspace.root !== null) timelineView.open(workspace.root);
        return;
      case 'language':
        // 言語は中の選択欄で選ぶ。見出しを押しただけでは何も変えない。
        return;
    }
  }

  function toggleMenu(menu: MenuId): void {
    openMenu = openMenu === menu ? null : menu;
  }

  function moveMenu(from: MenuId, step: 1 | -1): void {
    const next = nextMenuId(from, step);
    openMenu = next;
    buttons[next]?.focus();
  }

  function onMenuKeydown(event: KeyboardEvent, menu: MenuId): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveMenu(menu, 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveMenu(menu, -1);
    } else if (event.key === 'Escape' && openMenu !== null) {
      event.preventDefault();
      openMenu = null;
      buttons[menu]?.focus();
    }
  }

  // サイト書き出しの知らせ。出せなかった文書がある場合は件数まで出す（黙って減らさない）。
  function siteNote(result: SiteExportResult): string {
    if (result.kind === 'error') return result.message;
    if (result.kind === 'none') return t('action.siteNone');
    if (result.skipped.length === 0) {
      return t('action.siteDone', { dir: result.dir, count: result.count });
    }
    return t('action.siteDoneSkipped', {
      dir: result.dir,
      count: result.count,
      skipped: result.skipped.length,
    });
  }

  // 出せなかった文書は、どれがなぜ駄目だったかを hover で読めるようにしておく。
  // 件数だけだと、直しようがない。
  function siteNoteTitle(result: SiteExportResult): string {
    const note = siteNote(result);
    if (result.kind === 'error' || result.skipped.length === 0) return note;
    return [note, ...result.skipped.map((skip) => `${skip.path}: ${skip.reason}`)].join('\n');
  }

  // ブラウザ表示が始められなかった理由。出せている間は URL の方を出すので、ここは通らない。
  function browserNote(notice: BrowserPreviewNotice): string {
    return notice.kind === 'error' ? notice.message : t('action.siteNone');
  }

  // 画像書き出しの知らせ。1 枚のときは置き場、一括のときは枚数。途中で止めたときは
  // 「何枚まで出たか」を出す（出したものは消さないので、そこだけが分かればよい）。
  function imageNote(result: ImageExportResult): string {
    if (!result.ok) return result.message;
    if (result.kind === 'one') return t('action.imageDone', { path: result.path });
    return result.stopped
      ? t('batch.stopped', { count: result.count })
      : t('batch.done', { count: result.count });
  }
</script>

<!-- 地はドラッグ領域のまま。言葉とメニューの外側を掴めば、この行でも窓を動かせる。 -->
<div class="menubar" data-tauri-drag-region>
  <nav class="menus" aria-label={t('menu.bar')}>
    {#each MENU_IDS as menu (menu)}
      <div class="menu">
        <button
          class="menu-btn"
          class:is-open={openMenu === menu}
          type="button"
          bind:this={buttons[menu]}
          onclick={() => toggleMenu(menu)}
          onmouseenter={() => {
            if (openMenu !== null) openMenu = menu;
          }}
          onkeydown={(event) => onMenuKeydown(event, menu)}
          aria-haspopup="menu"
          aria-expanded={openMenu === menu}
        >
          {menuLabel(menu)}
        </button>
        {#if openMenu === menu}
          <!-- 外側を押したら閉じる。閉じるためのボタンを増やすより、どこを押しても閉じるほうが早い。 -->
          <div class="scrim" role="presentation" onclick={() => (openMenu = null)}></div>
          <div class="pane" role="menu" aria-label={menuLabel(menu)}>
            {#each itemsOf(menu) as item (item)}
              {#if item === 'language'}
                <div class="pane-row">
                  <span class="check" aria-hidden="true"></span>
                  <LanguageSelect />
                </div>
              {:else}
                <button
                  class="pane-item"
                  type="button"
                  onclick={() => runItem(item)}
                  disabled={!isItemEnabled(item, caps)}
                >
                  <!-- 入り切りするものだけ、左端にチェックの場所を持つ。位置は揃えるので、
                       印の無い項目でも幅は取る（押すたびに文字が横へ動かない）。 -->
                  <span class="check" aria-hidden="true"
                    >{itemToggleState(item, caps) === true ? '✓' : ''}</span
                  >
                  <span class="pane-text">{itemLabel(item)}</span>
                </button>
              {/if}
            {/each}
          </div>
        {/if}

        {#if menu === 'export' && imageExport.picking}
          <!-- 画像は押してすぐ撮らない。寸法・倍率・形式は貼る先によって毎回変わるので、
               既定のまま撮って捨てる往復が起きる。 -->
          <div class="scrim" role="presentation" onclick={() => imageExport.close()}></div>
          <div class="picker-pane" role="group" aria-label={t('action.image')}>
            <label class="picker-row">
              <span class="picker-label">{t('image.size')}</span>
              <select
                value={imageExport.order.preset}
                onchange={(event) =>
                  imageExport.choose({ preset: event.currentTarget.value as ImagePresetName })}
              >
                {#each IMAGE_PRESETS as preset (preset.name)}
                  <option value={preset.name}>
                    {t(`image.preset.${preset.name}`)}（{preset.width}×{preset.height}）
                  </option>
                {/each}
              </select>
            </label>
            <label class="picker-row">
              <span class="picker-label">{t('image.scale')}</span>
              <select
                value={String(imageExport.order.scale)}
                onchange={(event) =>
                  imageExport.choose({ scale: Number(event.currentTarget.value) })}
              >
                <option value="1">1×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
                <option value="3">3×</option>
              </select>
            </label>
            <label class="picker-row">
              <span class="picker-label">{t('image.format')}</span>
              <select
                value={imageExport.order.format}
                onchange={(event) =>
                  imageExport.choose({ format: event.currentTarget.value as ImageFormatChoice })}
              >
                <option value="png">{t('image.format.png')}</option>
                <option value="png-transparent">{t('image.format.pngTransparent')}</option>
                <option value="jpeg">{t('image.format.jpeg')}</option>
              </select>
            </label>
            {#if imageExport.order.format === 'jpeg'}
              <!-- 画質は JPEG のときだけ効く。PNG のときも並べると、動かない欄を
                   触って「効かない」と受け取られる。 -->
              <label class="picker-row">
                <span class="picker-label">{t('image.quality')}</span>
                <input
                  type="range"
                  min="30"
                  max="100"
                  step="5"
                  value={imageExport.order.quality}
                  oninput={(event) =>
                    imageExport.choose({ quality: Number(event.currentTarget.value) })}
                />
              </label>
            {/if}
            <!-- 押す前に、倍率を掛けた後の実寸を出す。型の名前だけだと、貼る先の
                 ピクセル規定に合っているか判断できない。 -->
            <p class="picker-summary">{imageExport.summary}</p>
            <button
              class="picker-go is-primary"
              type="button"
              onclick={() => void imageExport.run()}
              disabled={!imageExport.canExport}
            >
              {t('image.shoot')}
            </button>
            <!-- 一括は、文書の frontmatter に `batch:` があるときだけ意味を持つ。ボタンを
                 隠さないのは、無いときに「無い」と言うほうが、押せる場所を探させるより早いため。 -->
            <button
              class="picker-go"
              type="button"
              onclick={() => void imageExport.runBatch()}
              disabled={!imageExport.canExport}
            >
              {t('batch.run')}
            </button>
          </div>
        {/if}
      </div>
    {/each}
    <!-- ヘルプは中身が 1 枚しかないので、メニューを挟まずそのまま開く。 -->
    <HelpButton align="left" />
  </nav>

  <!-- 書き出しの知らせ。行の右側の空きに出す（上の行へは出さない。掴む場所が減る）。 -->
  <div class="notices">
    {#if imageExport.progress !== null}
      <span class="export-note" role="status">
        {t('batch.progress', {
          done: imageExport.progress.done,
          total: imageExport.progress.total,
        })}
      </span>
      <button class="note-btn" type="button" onclick={() => imageExport.stop()}>
        {t('batch.stop')}
      </button>
    {/if}
    {#if imageExport.result !== null}
      <span
        class="export-note"
        class:is-error={!imageExport.result.ok}
        role="status"
        title={imageNote(imageExport.result)}
      >
        {imageNote(imageExport.result)}
      </span>
    {/if}
    {#if htmlExport.result !== null}
      <!-- 書き出した先／断られた理由。読めば用が済むのでしばらくして自分で消える。 -->
      <span
        class="export-note"
        class:is-error={!htmlExport.result.ok}
        role="status"
        title={htmlExport.result.ok
          ? t('action.htmlDone', { path: htmlExport.result.path })
          : htmlExport.result.message}
      >
        {htmlExport.result.ok
          ? t('action.htmlDone', { path: htmlExport.result.path })
          : htmlExport.result.message}
      </span>
    {/if}
    {#if siteExport.result !== null}
      <span
        class="export-note"
        class:is-error={siteExport.result.kind !== 'done'}
        role="status"
        title={siteNoteTitle(siteExport.result)}
      >
        {siteNote(siteExport.result)}
      </span>
    {/if}
    {#if browserPreview.serving !== null}
      <!-- 出している間はアドレスを出しっぱなしにする。消すと、開き直す先が分からなくなる。 -->
      <span
        class="export-note"
        role="status"
        title={t('action.browserServing', { url: browserPreview.serving.url })}
      >
        {t('action.browserServing', { url: browserPreview.serving.url })}
      </span>
    {:else if browserPreview.notice !== null}
      <span class="export-note is-error" role="status" title={browserNote(browserPreview.notice)}>
        {browserNote(browserPreview.notice)}
      </span>
    {/if}
  </div>
</div>

<!-- 同意を尋ねている間だけ出る。押されるまで待ち受けは立たない。 -->
{#if browserPreview.consent !== null}
  <TrustDialog
    root={browserPreview.consent.root}
    origins={browserPreview.consent.origins}
    onallow={() => void browserPreview.allow()}
    oncancel={() => browserPreview.dismissConsent()}
  />
{/if}

<style>
  .menubar {
    height: var(--menubar-h);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 0 var(--space-2);
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }

  .menus {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }

  .menu {
    position: relative;
    display: inline-flex;
  }

  .menu-btn {
    height: 24px;
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .menu-btn:hover,
  .menu-btn.is-open {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .menu-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
    color: var(--text-primary);
  }

  /* ヘルプは子コンポーネント側の体裁を持つので、ここで同じ高さの言葉に揃える。 */
  .menus :global(.help-wrap .btn) {
    height: 24px;
    padding: 0 var(--space-2);
    gap: var(--space-1);
  }

  .menus :global(.help-wrap .btn-ico) {
    display: none;
  }

  /* 開いている間、外側のどこを押しても閉じられるようにする層。 */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .pane {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 41;
    min-width: 12rem;
    display: flex;
    flex-direction: column;
    padding: var(--space-1);
    background: var(--bg-elevated, var(--bg-subtle));
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / 0.18));
  }

  .pane-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 28px;
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font-size: var(--text-sm-size);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .pane-item:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .pane-item:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .pane-item:disabled {
    color: var(--text-secondary);
    opacity: 0.45;
    cursor: default;
  }

  .check {
    flex: none;
    width: 1em;
    color: var(--accent);
  }

  .pane-text {
    flex: 1;
  }

  /* 言語だけは選択欄そのものを置く。押して閉じて選び直す往復を作らない。 */
  .pane-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 28px;
    padding: 0 var(--space-2);
  }

  /* ── 画像出力の選択欄 ──────────────────────────────────────────── */
  .picker-pane {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 41;
    width: 17rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--bg-elevated, var(--bg-subtle));
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / 0.18));
    text-align: left;
  }

  .picker-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .picker-label {
    flex: none;
    width: 4.5em;
    font-size: var(--text-2xs-size);
    color: var(--text-secondary);
  }

  .picker-row select,
  .picker-row input[type='range'] {
    flex: 1;
    min-width: 0;
    height: 26px;
    font-size: var(--text-2xs-size);
    color: var(--text-primary);
    background: var(--bg-base, transparent);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .picker-row input[type='range'] {
    border: none;
    background: transparent;
  }

  /* 出来上がりの実寸。押す前に見えている必要があるので、控えめでも消さない。 */
  .picker-summary {
    margin: 0;
    font-size: var(--text-2xs-size);
    color: var(--text-secondary);
  }

  .picker-go {
    width: 100%;
    height: 28px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    cursor: pointer;
  }

  .picker-go.is-primary {
    background: var(--accent-subtle);
    color: var(--text-primary);
  }

  .picker-go:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .picker-go:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* ── 知らせ ─────────────────────────────────────────────────── */
  .notices {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    overflow: hidden;
  }

  /* 書き出し結果。パスは長くなりうるので幅を切って省略し、全文は title で読ませる。 */
  .export-note {
    flex: none;
    max-width: 32ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs-size);
    line-height: 1.8;
    color: var(--text-secondary);
  }

  .export-note.is-error {
    background: var(--danger-bg);
    color: var(--danger-fg);
  }

  .note-btn {
    flex: none;
    height: 22px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-2xs-size);
    cursor: pointer;
  }

  .note-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
