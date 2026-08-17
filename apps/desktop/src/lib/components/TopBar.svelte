<script lang="ts">
  import { onMount } from 'svelte';
  import { themeController } from '$lib/theme.svelte';
  import { titlebarController } from '$lib/window/titlebar.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { autosave } from '$lib/workspace/autosave.svelte';
  import { pdfExport } from '$lib/preview/pdfExport.svelte';
  import { htmlExport } from '$lib/preview/htmlExportController.svelte';
  import {
    siteExport,
    type SiteExportResult,
  } from '$lib/preview/siteExportController.svelte';
  import {
    browserPreview,
    type BrowserPreviewNotice,
  } from '$lib/preview/browserPreviewController.svelte';
  import { timelineView } from '$lib/logs/timelineView.svelte';
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
  // ブラウザ表示が始められなかった理由。出せている間は URL の方を出すので、ここは通らない。
  function browserNote(notice: BrowserPreviewNotice): string {
    return notice.kind === 'error' ? notice.message : t('action.siteNone');
  }

  function siteNoteTitle(result: SiteExportResult): string {
    const note = siteNote(result);
    if (result.kind === 'error' || result.skipped.length === 0) return note;
    return [note, ...result.skipped.map((skip) => `${skip.path}: ${skip.reason}`)].join('\n');
  }
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
      <!-- オートセーブのオン/オフ（既定オン）。オンの間は編集の静止後に自動保存する。
           循環矢印＝自動反映の普遍アイコン。押しても画面が変わらないと「何が起きたのか」が
           分からないので、色だけでなく現在の状態を語で出す。実際に保存されたことは
           ステータスバーの保存時刻で分かる。 -->
      <button
        class="btn ghost with-icon"
        class:is-on={autosave.enabled}
        type="button"
        onclick={() => autosave.toggle()}
        aria-pressed={autosave.enabled}
        title={autosave.enabled ? t('action.autosaveOn') : t('action.autosaveOff')}
        aria-label={t('action.autosave')}
      >
        <svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <path
            d="M13.75 2.5v2.75H11"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{t('action.autosave')}</span>
        <span class="state-pill">{autosave.enabled ? t('state.on') : t('state.off')}</span>
      </button>
      <!-- PDF 出力（DESIGN §6.4・Ctrl+P / ⌘P と等価）。プレビュー描画中だけ活性。押すと
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
      <!-- HTML 出力。プレビューと同じものを 1 ファイルとして文書の隣へ書き出す。
           書き出し先はここから渡さない（元の .md の場所から Rust が決める）。
           アイコンは山括弧＝ソースの見た目そのもの。 -->
      <button
        class="btn ghost with-icon"
        type="button"
        onclick={() => void htmlExport.run()}
        disabled={!htmlExport.canExport}
        title={t('action.htmlTitle')}
        aria-label={t('action.html')}
      >
        <svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M5.75 5 2.5 8l3.25 3M10.25 5 13.5 8l-3.25 3"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{t('action.html')}</span>
      </button>
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
      <!-- サイト出力。フォルダ内の .md をまとめて dist/ へ置く。開いている文書に依らないので
           プレビューの状態は見ない（フォルダさえ開いていれば押せる）。
           アイコンは地球儀＝そのまま配れる Web の見た目。 -->
      <button
        class="btn ghost with-icon"
        type="button"
        onclick={() => void siteExport.run()}
        disabled={!siteExport.canExport}
        title={t('action.siteTitle')}
        aria-label={t('action.site')}
      >
        <svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.2" />
          <path
            d="M2.5 8h11M8 2.5c1.5 1.5 2.3 3.4 2.3 5.5S9.5 12.5 8 13.5C6.5 12.5 5.7 10.1 5.7 8S6.5 4 8 2.5Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
        </svg>
        <span>{t('action.site')}</span>
      </button>
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
      <!-- ブラウザで見る。サイト出力と同じ中身を、置かずにこの PC の中だけで出す。
           出している間は押すと畳む（同じボタンで入り切りする）。
           アイコンは窓＝ブラウザのウィンドウ。 -->
      <button
        class="btn ghost with-icon"
        type="button"
        onclick={() =>
          browserPreview.serving === null
            ? workspace.root && void browserPreview.start(workspace.root)
            : void browserPreview.stop()}
        disabled={browserPreview.busy || (browserPreview.serving === null && workspace.root === null)}
        aria-pressed={browserPreview.serving !== null}
        title={browserPreview.serving === null
          ? t('action.browserTitle')
          : t('action.browserStopTitle')}
        aria-label={t('action.browser')}
      >
        <svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true">
          <rect
            x="1.75"
            y="2.75"
            width="12.5"
            height="10.5"
            rx="1.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
          <path d="M1.75 5.75h12.5" fill="none" stroke="currentColor" stroke-width="1.2" />
          <circle cx="4" cy="4.25" r="0.55" fill="currentColor" />
          <circle cx="5.9" cy="4.25" r="0.55" fill="currentColor" />
        </svg>
        <span>{t('action.browser')}</span>
      </button>
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
      <!-- 時系列。ログは文書ツリーに出ない（出すとエディタで開けてしまう）ので、
           ここが唯一の入口になる。フォルダを開いていなければ押せない。 -->
      <button
        class="btn ghost with-icon"
        type="button"
        onclick={() =>
          timelineView.active
            ? timelineView.close()
            : workspace.root && timelineView.open(workspace.root)}
        disabled={workspace.root === null}
        aria-pressed={timelineView.active}
        title={t('timeline.openTitle')}
        aria-label={t('timeline.open')}
      >
        <svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M2 8h12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <circle cx="4.5" cy="8" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2" />
          <circle cx="9" cy="8" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2" />
          <circle cx="13" cy="8" r="1.1" fill="currentColor" />
        </svg>
        <span>{t('timeline.open')}</span>
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
    /* 左右を等分の 1fr にして中央列（文書名）を窓の中央へ置く。ただし素の 1fr / auto は
       min-content を下回れないため、幅が足りなくなるとトラックが帯からはみ出し、
       中央寄せの文書名と右寄せのアクション群が重なる。左と中央は 0 まで縮められるように、
       右はアクション群の min-content を下限にして、詰まったときは
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

  /* ── ウィンドウ幅に応じたアクション群の段階的縮退 ───────────────────
     タイトルバーを兼ねる帯なので、ウィンドウが狭まると .actions が押し潰されて
     ラベルが 2 行に折り返し、帯の高さと文書名の位置が崩れる。折り返しは禁じたうえで
       全文 → 末尾を … で省略 → アイコンのみ
     と段階的に落とし、最後までアイコンとクリック領域は残す（title / aria-label が
     残るので、ラベルが消えても何のボタンかは辿れる）。
     言語セレクタとヘルプは子コンポーネント側の scoped CSS を持つため、
     ここからは :global で同じ体裁に揃える。 */
  .actions :global(.btn),
  .actions :global(.lang) {
    white-space: nowrap;
  }

  @media (max-width: 1120px) {
    .actions :global(.btn > span) {
      display: inline-block;
      max-width: 4.5em;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: middle;
    }

    /* ネイティブ select は文字を … で省略できないので、幅で頭出しだけ残す。 */
    .actions :global(.lang-select) {
      max-width: 5em;
    }

    .actions {
      gap: 0;
    }
  }

  @media (max-width: 900px) {
    /* 帯の幅を文書名に譲る。ブランドドットは残るので出自は分かる。 */
    .brand {
      display: none;
    }

    .actions :global(.btn > span) {
      display: none;
    }

    .actions :global(.btn) {
      padding: 0 var(--space-2);
    }

    /* select は畳めないので、地球儀アイコンの上へ透明なまま重ねて当たり判定にする
       （不可視でもネイティブのドロップダウンは通常どおり開く）。 */
    .actions :global(.lang) {
      position: relative;
    }

    .actions :global(.lang-select) {
      position: absolute;
      inset: 0;
      width: 100%;
      max-width: none;
      padding: 0;
      opacity: 0;
    }
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

  /* オートセーブ ON はアクセント色で点灯し、無効/有効が一目で分かるようにする。 */
  .btn.is-on {
    color: var(--accent);
  }

  /* オン/オフの語。色を見分けられなくても状態が分かるよう、枠付きの小片で並べる。 */
  .state-pill {
    flex: none;
    padding: 0 var(--space-1);
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs-size);
    line-height: 1.5;
    opacity: 0.85;
  }

  /* 書き出し結果。パスは長くなりうるので幅を切って省略し、全文は title で読ませる。 */
  .export-note {
    flex: none;
    max-width: 22ch;
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
