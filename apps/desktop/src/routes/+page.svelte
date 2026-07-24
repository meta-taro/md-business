<script lang="ts">
  import { untrack, onMount, onDestroy } from 'svelte';
  import { themeController } from '$lib/theme.svelte';
  import { renderPreview } from '$lib/preview/renderPreview';
  import { pdfExport } from '$lib/preview/pdfExport.svelte';
  import CodeMirrorEditor from '$lib/editor/CodeMirrorEditor.svelte';
  import { debounce } from '$lib/util/debounce';
  import { parseTsv, serializeTsv, type TsvDocument } from '@md-business/schema-test-spec-tsv';
  import { isTsvSource } from '$lib/tsv/detect';
  import TsvGrid from '$lib/tsv/TsvGrid.svelte';
  import { browser } from '$app/environment';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { diffView } from '$lib/git/diffView.svelte';
  import DiffView from '$lib/components/DiffView.svelte';
  import {
    DEFAULT_SPLIT_RATIO,
    ratioFromPointer,
    parseStoredRatio,
    stepRatio,
  } from '$lib/layout/splitRatio';
  import {
    candidateLines,
    extractSearchTokens,
    pickNearestY,
    scrollFraction,
    type EditorFocusInfo,
  } from '$lib/layout/scrollSync';

  // 中央 = 左右 2 分割（DESIGN §6）。左＝Markdown エディター（CodeMirror 6）、
  // 右＝ビューワー（renderer-pdf の HTML を iframe 隔離）。
  //
  // source は共有 workspace ストアが唯一の真実（§2.1）。左レールで開いたファイルも、
  // ここでの編集も同じ source を指す。ファイル未オープン時は seed テンプレ。
  const source = $derived(workspace.source);
  // debounce 後の値。プレビューはこちらから描画し、タイプ中の再描画連打を抑える。
  let debouncedSource = $state(workspace.source);

  // §6.2 既定 200ms。最後の入力から 200ms 静止で 1 回だけプレビューへ反映。
  const pushToPreview = debounce((value: string) => {
    debouncedSource = value;
  }, 200);

  // ファイルを開いた瞬間（loadSeq 変化）はプレビューへ即反映する。source を untrack して
  // 依存を loadSeq だけに絞り、タイプ中の debounce を壊さない。
  $effect(() => {
    workspace.loadSeq;
    debouncedSource = untrack(() => workspace.source);
  });

  function handleEditorChange(value: string): void {
    workspace.setSource(value);
    pushToPreview(value);
  }

  // ── エディター → プレビューのフォーカス追従（scrollSync）──
  // 見出しアンカー方式はデータ駆動スキーマ（本文に見出しが無い）で破綻したので破棄。
  // 代わりに「フォーカス行（カーソル行／スクロール時は先頭可視行）の文言をプレビュー内で
  // 検索し、その位置へ合わせる」。行の値がプレビューにも逐語で現れる（フィールド名・ID 等）
  // 性質を使うため、全スキーマで対応が取れる。行の語がプレビューに無ければ近傍行へ順に
  // フォールバックし、どれも無ければ割合同期へ退避する。
  let lastFocus: EditorFocusInfo | null = null;
  let scrollRaf = 0;
  // プレビューを目標位置へ滑らかに寄せるフォローループの状態。
  let followRaf = 0;
  let scrollTarget = 0;

  // preview 内で token に一致する text node の内容座標 Y を集める（複数ヒットは後で絞る）。
  function findPreviewYs(doc: Document, token: string, limit = 16): number[] {
    // documentElement の getBoundingClientRect().top は -scrollTop なので、これを基準に
    // 引くと一致位置のスクロール込み絶対 Y（内容座標）になる。
    const base = doc.documentElement.getBoundingClientRect().top;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const ys: number[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue ?? '';
      const idx = text.indexOf(token);
      if (idx < 0) continue;
      const range = doc.createRange();
      range.setStart(node, idx);
      range.setEnd(node, Math.min(idx + token.length, text.length));
      ys.push(range.getBoundingClientRect().top - base);
      if (ys.length >= limit) break;
    }
    return ys;
  }

  function applyPreviewScroll(): void {
    const info = lastFocus;
    const doc = viewerFrame?.contentDocument;
    const win = viewerFrame?.contentWindow;
    const scroller = doc?.scrollingElement;
    if (!info || !doc || !win || !scroller) return;

    const previewMax = scroller.scrollHeight - scroller.clientHeight;
    if (previewMax <= 0) return;

    // 割合位置＝当たりが無いときのフォールバック、かつ複数ヒットの絞り込み基準。
    const expectedY =
      scrollFraction(info.scrollTop, info.scrollHeight, info.clientHeight) * previewMax;

    const lines = source.split('\n');
    let targetY: number | null = null;
    for (const lineNo of candidateLines(info.focusLine, lines.length)) {
      for (const token of extractSearchTokens(lines[lineNo - 1] ?? '')) {
        const y = pickNearestY(findPreviewYs(doc, token), expectedY);
        if (y !== null) {
          targetY = y;
          break;
        }
      }
      if (targetY !== null) break;
    }

    // フォーカス行の文言をプレビュー上端付近へ（先頭行にフォーカスがある前提・少し余白）。
    const finalY = Math.max(0, Math.min((targetY ?? expectedY) - 8, previewMax));
    followTo(finalY);
  }

  // 目標位置へ即ジャンプすると毎フレーム段差＝「かくかく」する。代わりにイージングで
  // 現在位置から目標へ滑らかに寄せる（にゅーん）。目標はスクロール中に更新され続けるので、
  // ループは常に最新の scrollTarget を追い、追い付いたら止める。iframe は毎フレーム引き直す
  // ので srcdoc 再生成後も破綻しない。
  function followTo(target: number): void {
    scrollTarget = target;
    if (followRaf !== 0) return; // 既に追従中（更新後の目標をそのまま追う）
    const step = (): void => {
      const win = viewerFrame?.contentWindow;
      const scroller = viewerFrame?.contentDocument?.scrollingElement;
      if (!win || !scroller) {
        followRaf = 0;
        return;
      }
      const current = scroller.scrollTop;
      const delta = scrollTarget - current;
      if (Math.abs(delta) < 1) {
        win.scrollTo(0, scrollTarget); // 端数を詰めて停止
        followRaf = 0;
        return;
      }
      win.scrollTo(0, current + delta * 0.18); // 毎フレーム残差の一定割合だけ寄せる
      followRaf = requestAnimationFrame(step);
    };
    followRaf = requestAnimationFrame(step);
  }

  function handleEditorSync(info: EditorFocusInfo): void {
    lastFocus = info;
    // 目標の再計算は 1 フレーム 1 回に間引く（追従アニメーションは followTo が別途回す）。
    if (scrollRaf !== 0) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      applyPreviewScroll();
    });
  }

  // 追従グライドを中断する（プレビューをユーザーが操作したとき用）。次のエディター操作で
  // 再び followTo が呼ばれれば追従は再開する＝ドライバはあくまでエディター側。
  function cancelFollow(): void {
    if (followRaf !== 0) {
      cancelAnimationFrame(followRaf);
      followRaf = 0;
    }
  }

  // iframe ロード時: プレビュー側のユーザースクロールを検知して追従を止めるリスナーを張り、
  // 直近フォーカスへ 1 度だけ位置合わせする。srcdoc 再生成のたびに document が入れ替わり
  // リスナーも一緒に消えるので、毎ロードで張り直す（リーク無し）。
  function onPreviewLoad(): void {
    const win = viewerFrame?.contentWindow;
    if (win) {
      // wheel / タッチ / スクロールバー掴み / スクロール系キー＝ユーザーの操作意図。
      // プログラムの scrollTo はこれらを発火しないので誤検知しない。
      win.addEventListener('wheel', cancelFollow, { passive: true });
      win.addEventListener('touchstart', cancelFollow, { passive: true });
      win.addEventListener('pointerdown', cancelFollow, { passive: true });
      win.addEventListener('keydown', cancelFollow);
    }
    applyPreviewScroll();
  }

  // frontmatter を registry で振り分け、該当スキーマのビューワーで描画する（6 スキーマ
  // 自動判定・Phase 2b）。テーマ変更に追従して iframe 内 <html data-theme> も一致させる
  // （別ドキュメントなのでアプリの data-theme は継承されない）。debouncedSource / theme の
  // 変化で即再描画。
  const preview = $derived(
    renderPreview(debouncedSource, { theme: themeController.value }),
  );

  // PDF 出力（§6.4）。プレビュー iframe を print-to-PDF する関数を共有コントローラへ
  // 登録し、Top bar の [PDF] から起動する。iframe の srcdoc は renderer-pdf の @page
  // CSS を内包するので、印刷（→「PDF として保存」）で画面と 1:1 の A4 正本になる。
  let viewerFrame = $state<HTMLIFrameElement | undefined>(undefined);
  onMount(() => {
    pdfExport.register(() => {
      const win = viewerFrame?.contentWindow;
      if (!win) return;
      win.focus();
      win.print();
    });
  });
  onDestroy(() => {
    pdfExport.unregister();
    if (scrollRaf !== 0) cancelAnimationFrame(scrollRaf);
    if (followRaf !== 0) cancelAnimationFrame(followRaf);
  });
  // schema / Markdown ビューワー描画中だけ [PDF] を活性化する。TSV 編集グリッドは
  // 印刷対象の iframe を持たないため対象外。
  $effect(() => {
    pdfExport.setReady(preview.ok && !isTsv && !diffView.active);
  });

  // カスタム TSV 検証シートは読み取りプレビューでなく編集グリッド（本命 UI・Issue 010）で開く。
  // 先頭マジック行で判定し、TSV なら parseTsv した doc をグリッドへ渡す。
  const isTsv = $derived(isTsvSource(debouncedSource));
  const tsvDoc = $derived(isTsv ? parseTsv(debouncedSource) : null);

  // グリッド編集 → serializeTsv で source（＝正本）へ書き戻し、エディターと即同期する。
  // debouncedSource も即更新して doc を再導出し、グリッドを遅延なく反映する。
  function handleGridChange(next: TsvDocument): void {
    const text = serializeTsv(next);
    workspace.setSource(text);
    debouncedSource = text;
  }

  // ── 検証グリッドの全画面 ──
  // 検証中はエディター/プレビュー分割が邪魔なので、分割を畳んでグリッドを全幅にする。
  // 全画面は TSV グリッド表示中のみ意味を持ち、条件を外れれば自動で分割へ戻る（DESIGN §5.8/§6）。
  let gridFullscreen = $state(false);

  function toggleGridFullscreen(): void {
    gridFullscreen = !gridFullscreen;
  }

  // Escape で全画面を抜ける。ただしセル編集中（入力にフォーカス）の Escape は入力側へ譲る。
  function onWindowKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !gridFullscreen) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    gridFullscreen = false;
  }

  // ── 中央ディバイダ（左右幅比のドラッグ調整 + 50/50 リセット・DESIGN §6）──
  // 左ペイン占有率 0〜1。localStorage から復元し、変更のたびに永続化する。
  const SPLIT_STORAGE_KEY = 'md-business:desktop:split-ratio';
  const DIVIDER_W = 6; // px。CSS の .divider 幅と一致させる。
  const KEY_STEP_PX = 24; // 矢印キー 1 回の移動量（px 相当）。

  let splitRatio = $state(
    browser ? parseStoredRatio(localStorage.getItem(SPLIT_STORAGE_KEY)) : DEFAULT_SPLIT_RATIO,
  );
  let splitEl = $state<HTMLDivElement>();
  let dragging = $state(false);

  // grid-template-columns 文字列。カスタムプロパティ経由で渡し、狭幅時は
  // メディアクエリ側の縦積みで上書きできるようにする（インライン直書きしない）。
  function dividerColumns(ratio: number): string {
    return `${ratio}fr ${DIVIDER_W}px ${1 - ratio}fr`;
  }

  function persistRatio(): void {
    if (browser) localStorage.setItem(SPLIT_STORAGE_KEY, String(splitRatio));
  }

  function startDrag(event: PointerEvent): void {
    if (!splitEl) return;
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onDrag(event: PointerEvent): void {
    if (!dragging || !splitEl) return;
    const rect = splitEl.getBoundingClientRect();
    splitRatio = ratioFromPointer(event.clientX, rect.left, rect.width);
  }

  function endDrag(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    const el = event.currentTarget as HTMLElement;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    persistRatio();
  }

  function resetSplit(): void {
    splitRatio = DEFAULT_SPLIT_RATIO;
    persistRatio();
  }

  function onDividerKey(event: KeyboardEvent): void {
    if (!splitEl) return;
    const width = splitEl.getBoundingClientRect().width;
    switch (event.key) {
      case 'ArrowLeft':
        splitRatio = stepRatio(splitRatio, -1, width, KEY_STEP_PX);
        break;
      case 'ArrowRight':
        splitRatio = stepRatio(splitRatio, 1, width, KEY_STEP_PX);
        break;
      case 'Home':
      case 'Enter':
        resetSplit();
        break;
      default:
        return;
    }
    persistRatio();
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div
  class="split"
  class:dragging
  class:grid-full={isTsv && !!tsvDoc && gridFullscreen && !diffView.active}
  bind:this={splitEl}
  style="--split-cols: {dividerColumns(splitRatio)}"
>
  <section class="pane editor" aria-label="Markdown エディター">
    <div class="pane-head">エディター — Markdown</div>
    <CodeMirrorEditor value={source} onChange={handleEditorChange} onSync={handleEditorSync} />
  </section>

  <!-- ドラッグで幅調整・ダブルクリック / Home / Enter で 50/50・矢印キーで微調整 -->
  <!-- WAI-ARIA "Window Splitter" は role="separator" + tabindex + キーボード操作が正規の
       対話パターン。svelte-check は separator を非対話と見なすため、当該2規則のみ抑制する。 -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="divider"
    role="separator"
    aria-orientation="vertical"
    aria-label="エディターとプレビューの幅を調整（ダブルクリックで 50/50 に戻す）"
    aria-valuenow={Math.round(splitRatio * 100)}
    aria-valuemin={0}
    aria-valuemax={100}
    tabindex="0"
    onpointerdown={startDrag}
    onpointermove={onDrag}
    onpointerup={endDrag}
    ondblclick={resetSplit}
    onkeydown={onDividerKey}
  ></div>

  <section class="pane preview" aria-label="ビューワー（プレビュー）">
    {#if diffView.active}
      <!-- 変更ファイルをソース管理パネルでクリックした間だけ差分表示に切り替える。
           「プレビューに戻る」or 別ファイルを通常オープンで解除される。 -->
      <div class="pane-head">差分 — Git</div>
      <DiffView />
    {:else if isTsv && tsvDoc}
      <div class="pane-head grid-head">
        <span>検証シート — グリッド編集</span>
        <button
          type="button"
          class="head-btn"
          onclick={toggleGridFullscreen}
          aria-pressed={gridFullscreen}
          title={gridFullscreen ? '分割表示に戻す（Esc）' : 'グリッドを全画面表示'}
        >
          {gridFullscreen ? '↙ 分割に戻す' : '⤢ 全画面'}
        </button>
      </div>
      <div class="grid-wrap">
        <TsvGrid doc={tsvDoc} onChange={handleGridChange} />
      </div>
    {:else}
    <div class="pane-head">プレビュー{#if preview.ok} — {preview.label}{/if}</div>
    {#if preview.ok}
      <iframe
        class="viewer"
        bind:this={viewerFrame}
        srcdoc={preview.srcdoc}
        title="{preview.label}プレビュー"
        onload={onPreviewLoad}
      ></iframe>
      {#if preview.errors.length > 0 || preview.warnings.length > 0}
        <div class="notices" role="status">
          {#each preview.errors as err (err)}
            <span class="notice err">{err}</span>
          {/each}
          {#each preview.warnings as warn (warn)}
            <span class="notice warn">{warn}</span>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="pane-empty">
        <p class="hint">{preview.reason}</p>
        <span class="env">frontmatter（--- で囲む先頭ブロック）の書式を確認してください</span>
      </div>
    {/if}
    {/if}
  </section>
</div>

<style>
  .split {
    height: 100%;
    display: grid;
    /* 比率はインラインの --split-cols で駆動。未設定時（SSR 初期）は 50/50 相当。 */
    grid-template-columns: var(--split-cols, 1fr 6px 1fr);
    min-height: 0;
  }

  /* 検証グリッド全画面（DESIGN §5.8/§6）。エディター + ディバイダを畳み、グリッド（右ペイン）
     を単一カラムで全幅表示する。条件が外れれば class が落ち自動で分割へ戻る。 */
  .split.grid-full {
    grid-template-columns: minmax(0, 1fr);
  }

  .split.grid-full .pane.editor,
  .split.grid-full .divider {
    display: none;
  }

  /* ドラッグ中は iframe がポインタを奪わないよう無効化し、全体を col-resize に。 */
  .split.dragging {
    cursor: col-resize;
    user-select: none;
  }

  .split.dragging .viewer {
    pointer-events: none;
  }

  .pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* 中央ディバイダ。6px の実体 + 疑似要素で当たり判定を左右に広げる。 */
  .divider {
    position: relative;
    background: var(--border);
    cursor: col-resize;
    touch-action: none; /* タッチのスクロール発火を止めドラッグ専有 */
    transition: background 120ms ease;
  }

  .divider::before {
    content: '';
    position: absolute;
    inset: 0 -4px; /* 上下いっぱい・左右 +4px の掴みしろ */
  }

  .divider:hover,
  .divider:focus-visible {
    background: var(--accent);
    outline: none;
  }

  .pane-head {
    height: 34px;
    display: flex;
    align-items: center;
    padding: 0 var(--space-4);
    flex: none;
    font-size: var(--text-2xs-size);
    font-weight: var(--text-2xs-weight);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    border-bottom: 1px solid var(--border);
  }

  /* グリッドのペインヘッダは右端に全画面トグルを置く。 */
  .grid-head {
    justify-content: space-between;
    gap: var(--space-3);
  }

  .head-btn {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 var(--space-3);
    font-size: var(--text-2xs-size);
    font-weight: var(--text-2xs-weight);
    letter-spacing: 0.02em;
    color: var(--text-secondary);
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--dur-fast, 120ms) ease,
      border-color var(--dur-fast, 120ms) ease,
      color var(--dur-fast, 120ms) ease;
  }

  .head-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--border-strong);
  }

  .head-btn[aria-pressed='true'] {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .head-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .pane-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-6);
    text-align: center;
  }

  .viewer {
    flex: 1;
    min-height: 0;
    width: 100%;
    border: none;
    background: var(--bg-app);
  }

  /* TSV グリッド編集の器。TsvGrid は height:100% で内部スクロールするため高さを与える。 */
  .grid-wrap {
    flex: 1;
    min-height: 0;
  }

  .notices {
    flex: none;
    max-height: 30%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--border);
    background: var(--bg-subtle);
  }

  .notice {
    font-size: var(--text-2xs-size);
    line-height: 1.5;
  }

  .notice.err {
    color: var(--danger-fg);
  }

  .notice.warn {
    color: var(--warning-fg, var(--text-secondary));
  }

  .hint {
    margin: 0;
    font-size: var(--text-sm-size);
    line-height: 1.7;
    color: var(--text-tertiary);
  }

  .env {
    font-size: var(--text-xs-size);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    background: var(--accent-subtle);
    color: var(--accent);
  }

  /* < 768px: 左右分割をやめ縦積み（DESIGN §7.1・簡易対応。タブ切替は後続）。
     縦積みでは横幅ドラッグが無意味なのでディバイダを隠し、比率も無効化する。 */
  @media (max-width: 767px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 1fr 1fr;
    }

    .divider {
      display: none;
    }

    .pane.editor {
      border-bottom: 1px solid var(--border);
    }
  }
</style>
