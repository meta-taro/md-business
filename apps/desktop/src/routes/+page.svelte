<script lang="ts">
  import { untrack, onMount, onDestroy, tick } from 'svelte';
  import { themeController } from '$lib/theme.svelte';
  import { previewRenderer } from '$lib/preview/previewRenderer.svelte';
  import type { PreviewResult } from '$lib/preview/previewFactory';
  import { frontmatterMessage } from '$lib/preview/frontmatterMessage';
  import { pdfExport } from '$lib/preview/pdfExport.svelte';
  import { htmlExport } from '$lib/preview/htmlExportController.svelte';
  import { imageExport } from '$lib/preview/imageExportController.svelte';
  import { previewReady, previewVisible, shouldRenderPreview } from '$lib/preview/previewGate';
  import { resolvePreviewLink } from '$lib/preview/previewLink';
  import {
    frameWidth,
    nextViewport,
    needsResetForPrint,
    type ViewportName,
  } from '$lib/preview/viewport';
  import { findHeadingOffset } from '$lib/editor/headingAnchor';
  import { debounce } from '$lib/util/debounce';
  import type {
    CellLink,
    ComputedCounts,
    EnumChoices,
    IdentifiedTsv,
  } from '@md-business/schema-test-spec-tsv';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { isTsvSource } from '$lib/tsv/detect';
  import { loadGridDoc, saveGridDoc } from '$lib/tsv/gridDoc';
  import { checkSheetLinks, type SheetLinkIssue, type SheetReader } from '$lib/tsv/linkCheck';
  import { createSheetCache } from '$lib/tsv/sheetCache';
  import { readSheetEnums } from '$lib/tsv/sheetEnums';
  import { parseRowBlame, type RowBlame } from '$lib/tsv/rowBlame';
  import { countSheetReferences } from '$lib/tsv/sheetCounts';
  import { invoke } from '@tauri-apps/api/core';
  import TsvGrid from '$lib/tsv/TsvGrid.svelte';
  import DataTreeView from '$lib/data/DataTreeView.svelte';
  import ImageView from '$lib/image/ImageView.svelte';
  import { imageKindLabel, nextFitMode, type ImageFitMode } from '$lib/image/imageView';
  import { formatSize } from '$lib/components/fileInfo';
  import { isDataFile, readDataDocument } from '$lib/data/dataDocument';
  import { perf } from '$lib/diagnostics/perf.svelte';
  import {
    initHistory,
    pushHistory,
    undo as undoHistory,
    redo as redoHistory,
    historyChars,
    type GridHistory,
  } from '$lib/tsv/gridHistory';
  import { autosave } from '$lib/workspace/autosave.svelte';
  import { browser } from '$app/environment';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { resolveRelPath } from '$lib/workspace/relPath';
  import { diffView } from '$lib/git/diffView.svelte';
  import { timelineView } from '$lib/logs/timelineView.svelte';
  import TimelineView from '$lib/components/TimelineView.svelte';
  import DiffView from '$lib/components/DiffView.svelte';
  import SearchBar from '$lib/search/SearchBar.svelte';
  import { search } from '$lib/search/search.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { createPreviewSearchBinding } from '$lib/preview/previewSearchBinding';
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

  // エディタ一式（CodeMirror + 構文解析）は起動時に読むものの中で最も大きい。
  // 静的に読むと、まだ何も開いていない段階でこれを読み終わるまで窓が出ない。
  // 読み始めるのはここ（画面を組み立てる前）だが、待たずに先へ進む点が静的 import と違う。
  const editorComponent = import('$lib/editor/CodeMirrorEditor.svelte').then((m) => m.default);

  // 中央 = 左右 2 分割（DESIGN §6）。左＝Markdown エディター（CodeMirror 6）、
  // 右＝ビューワー（renderer-pdf の HTML を iframe 隔離）。
  //
  // source は共有 workspace ストアが唯一の真実。左レールで開いたファイルも、
  // ここでの編集も同じ source を指す。ファイル未オープン時は seed テンプレ。
  const source = $derived(workspace.source);
  // debounce 後の値。プレビューはこちらから描画し、タイプ中の再描画連打を抑える。
  let debouncedSource = $state(workspace.source);

  // DESIGN §6.2 既定 200ms。最後の入力から 200ms 静止で 1 回だけプレビューへ反映。
  const pushToPreview = debounce((value: string) => {
    debouncedSource = value;
  }, 200);

  // グリッド編集専用の undo/redo 履歴（正本＝TSV ソース）。エディタは CodeMirror の
  // 独自 undo を使うため、この履歴はグリッドがアクティブなときだけ動かす。
  let gridHistory = $state<GridHistory>(initHistory(workspace.source));

  // ファイルを開いた瞬間（loadSeq 変化）はプレビューへ即反映する。source を untrack して
  // 依存を loadSeq だけに絞り、タイプ中の debounce を壊さない。開き直し・外部再読込では
  // グリッド履歴も新しい内容で作り直す（別ファイルの undo が混ざらないように）。
  $effect(() => {
    workspace.loadSeq;
    const next = untrack(() => workspace.source);
    debouncedSource = next;
    gridHistory = initHistory(next);
    revealHidden = false;
  });

  // 編集（source 変化）と設定変更を受けて、デバウンス保存を予約する。実際の発火可否は
  // autosave 側の純ロジックが判定する（既定オン・無効化で予約解除）。
  $effect(() => {
    workspace.source;
    autosave.enabled;
    autosave.schedule();
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

  /**
   * プレビュー内のリンクを親側で受ける。
   *
   * iframe をそのまま遷移させると、プレビュー枠の中が指し先で上書きされて
   * 戻る手段が無くなる。押されたものが何かを resolvePreviewLink で決めてから、
   * ブラウザで開く / アプリで開く / 何もしない を親側で選ぶ。
   */
  function handlePreviewLinkClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    // iframe は別レルムなので instanceof は使えない（コンストラクタが別物）。
    if (!target || typeof target.closest !== 'function') return;
    const anchor = target.closest('a[href]');
    if (!anchor) return;
    const link = resolvePreviewLink(anchor.getAttribute('href') ?? '');
    // null は同じ文書の中の移動。既定の動きがそのまま正しいので横取りしない。
    if (link === null) return;
    event.preventDefault();
    if (link.kind === 'blocked') {
      workspace.reportError(t('page.linkNotOpenable', { href: link.href }));
      return;
    }
    if (link.kind === 'external') {
      // webview 内で遷移させない（アプリの画面がリンク先で上書きされる）。
      void openUrl(link.href).catch(() => {
        // Tauri 外（素の vite プレビュー）。何もしない。
      });
      return;
    }
    void openRelativeDocument(link.path);
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
      win.addEventListener('click', handlePreviewLinkClick);
    }
    applyPreviewScroll();
    // srcdoc 再生成でハイライト（CSS.highlights）が失われるため、プレビュー検索が開いたまま
    // なら新しいドキュメントへ貼り直す（開いていない／別対象なら refresh は no-op）。
    if (search.open && search.target === 'preview') search.refresh();
    // 図（Mermaid）は本文の組み立てとは別に、出来上がった文書を書き換える形で描く。
    // 本文側を同期のまま保つため。図が無ければ何も読み込まないので待たない。
    const doc = viewerFrame?.contentDocument;
    if (doc) {
      const theme = themeController.value;
      void import('$lib/preview/renderMermaid').then((module) =>
        module.renderMermaidInDocument(doc, { theme }),
      );
    }
  }

  // frontmatter を registry で振り分け、該当スキーマのビューワーで描画する（6 スキーマ
  // 自動判定）。テーマ変更に追従して iframe 内 <html data-theme> も一致させる
  // （別ドキュメントなのでアプリの data-theme は継承されない）。debouncedSource / theme の
  // 変化で即再描画。
  // 描画一式（検証器・文書 CSS・Markdown 組み立て）は起動時には読まず、プレビューを
  // 出す用ができた時点で読む。読み終わるまで preview は null＝まだ描けない状態。
  //
  // 描画が非同期なのは、スキーマごとの検証器を「開いた文書のぶんだけ」読むため。
  // 打つたびに走るので、先に始めた描画が後から返ることがある。世代を数えて、
  // 最後に始めたものの結果だけを採る（古い結果で今の本文を上書きしない）。
  let preview = $state<PreviewResult | null>(null);
  let previewGeneration = 0;
  $effect(() => {
    const render = previewRenderer.render;
    const source = debouncedSource;
    const theme = themeController.value;
    // 組み立て一式は一度読み込むと面を切り替えても残る。残っているだけで組み直しが動くと、
    // 検証グリッドで 1 文字打つたびに誰も見ない HTML を本文全体から組み直すことになる。
    if (render === null || !shouldRenderPreview(paneState)) {
      preview = null;
      return;
    }
    const generation = ++previewGeneration;
    void render(source, { theme }).then((result) => {
      if (generation === previewGeneration) preview = result;
    });
  });

  // PDF 出力（DESIGN §6.4）。プレビュー iframe を print-to-PDF する関数を共有コントローラへ
  // 登録し、Top bar の [PDF] から起動する。iframe の srcdoc は renderer-pdf の @page
  // CSS を内包するので、印刷（→「PDF として保存」）で画面と 1:1 の A4 正本になる。
  let viewerFrame = $state<HTMLIFrameElement | undefined>(undefined);
  // プレビュー枠の幅。狭い幅での折り返しを見るための切り替えで、アプリを開き直すと PC に戻る。
  let viewport = $state<ViewportName>('pc');
  onMount(() => {
    pdfExport.register(async () => {
      const win = viewerFrame?.contentWindow;
      if (!win) return;
      // 狭い表示のまま印刷すると、版面が変わっていても出来た PDF を開くまで気づけない。
      // 戻してから印刷し、何が印刷されるのかを画面に出す。
      if (needsResetForPrint(viewport)) {
        viewport = 'pc';
        await tick();
        // 幅を戻した中身が組み直されるまで待つ（枠の幅は次の描画で効く）。
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))),
        );
      }
      win.focus();
      win.print();
    });
    // プレビュー iframe の検索を共通ストアへ登録（getter で現在の iframe を都度取り直す＝
    // srcdoc 再生成で contentDocument が差し替わっても最新へ届く）。
    search.register('preview', createPreviewSearchBinding(() => viewerFrame, search.report));
    // 文書の形は診断タブを開いたときだけ取りに行く（毎編集で数えると計測へ混ざるため）。
    perf.setProbe(() => ({
      rows: tsvDoc?.rows.length ?? 0,
      columns: tsvDoc?.columns.length ?? 0,
      historyChars: historyChars(gridHistory),
      // グリッド全画面ではエディターを畳んでいる＝エディター側の作業は起きていない。
      // 数字を読む側がそこを取り違えないよう、画面の状態も一緒に持ち出す。
      view: { grid: isTsv && tsvDoc !== null, editor: !gridFullscreen },
    }));
  });
  onDestroy(() => {
    pdfExport.unregister();
    search.unregister('preview');
    if (scrollRaf !== 0) cancelAnimationFrame(scrollRaf);
    if (followRaf !== 0) cancelAnimationFrame(followRaf);
  });
  // カスタム TSV 検証シートは読み取りプレビューでなく編集グリッドで開く。
  // 先頭マジック行で判定し、TSV なら表として見せる分だけをグリッドへ渡す。
  // 行 ID 列と控え行（`#@ hidden`）は読み込みで外し、保存で戻す（gridDoc）。
  // ID を持たない既存ファイルはここで採番され、保存した時点でファイルへ焼かれる。
  // 控えを表に出しているか。戻す操作のための一時的な見せ方なので、ファイルには残さず
  // 開き直しで既定（外す）へ戻す。
  let revealHidden = $state(false);
  const isTsv = $derived(isTsvSource(debouncedSource));
  // 1 セル確定するたびに本文を組み直し、それをまたここで読み直している。読み直しは
  // 画面へ反映する途中で走るので、測らないと「画面への反映」に紛れて見えない。
  const tsvGrid = $derived(
    isTsv ? perf.measure('parse', () => loadGridDoc(debouncedSource, { reveal: revealHidden })) : null,
  );
  const tsvDoc = $derived(tsvGrid?.doc ?? null);

  // 別シートを指す列（`#@ link`）の照合結果。参照先を読むので同期では出せない。
  // 出るまでの間は空＝「問題なし」ではなく「まだ照合していない」なので、
  // 読めなかったこと自体も警告として linkCheck 側が 1 件返す。
  let linkIssues = $state<SheetLinkIssue[]>([]);
  // 読み終える順序は保証されない。開き直しが速いと古い結果が後から届くので、
  // 投げた順番を持って最後のものだけを採る。
  let linkCheckSeq = 0;

  $effect(() => {
    const doc = tsvDoc;
    const path = workspace.activePath;
    const seq = (linkCheckSeq += 1);

    if (doc === null || path === null) {
      linkIssues = [];
      return;
    }
    void checkSheetLinks(doc, path, readSheet).then((issues) => {
      if (seq === linkCheckSeq) linkIssues = issues;
    });
  });

  // 集計列（`countIn`）の件数。数える相手を読むので、こちらも同期では出せない。
  // 出るまでの間は空だが、空の列は applyComputed が触らない＝古い値が残るだけで、
  // 0 が書き込まれることはない。
  let counts = $state<ComputedCounts>(new Map());
  let countSeq = 0;

  $effect(() => {
    const doc = tsvDoc;
    const path = workspace.activePath;
    const seq = (countSeq += 1);

    if (doc === null || path === null) {
      counts = new Map();
      return;
    }
    void countSheetReferences(doc, path, readSheet).then((counted) => {
      if (seq === countSeq) counts = counted;
    });
  });

  // 選択肢を別シートから引く列（`enum(-> …)`）の選択肢。参照先を読むので同期では出せない。
  // 出るまでの間は空だが、空の列は検査もされない＝参照先を開いていないだけで既存の値が
  // 一斉に赤くなることはない。
  let choices = $state<EnumChoices>(new Map());
  let choiceSeq = 0;

  $effect(() => {
    const doc = tsvDoc;
    const path = workspace.activePath;
    const seq = (choiceSeq += 1);

    if (doc === null || path === null) {
      choices = new Map();
      return;
    }
    void readSheetEnums(doc, path, readSheet).then((read) => {
      if (seq === choiceSeq) choices = read;
    });
  });

  // 行の履歴（git blame）。git を毎回叩くので、出すと決めたときだけ読む。
  // 出していない間は空のまま＝グリッドは何も出さない。
  let blameOn = $state(false);
  let blame = $state<RowBlame>(new Map());
  let blameSeq = 0;

  $effect(() => {
    const on = blameOn;
    const path = workspace.activePath;
    const root = workspace.root;
    const seq = (blameSeq += 1);

    if (!on || path === null || root === null) {
      blame = new Map();
      return;
    }
    // 履歴が無い（未追跡・コミット皆無・git 未導入）ときは空文字列が返る。
    // 取れなかったことと「変更が無い」ことを分けないのは、どちらも出す中身が無いため。
    void invoke<string>('git_blame', { root, relPath: path })
      .then((porcelain) => {
        if (seq === blameSeq) blame = parseRowBlame(porcelain);
      })
      .catch(() => {
        if (seq === blameSeq) blame = new Map();
      });
  });

  /** 参照先 1 ファイルを読む。読めないもの（未オープン・別形式）は null で返す。 */
  async function readSheetFile(relPath: string): Promise<string | null> {
    const root = workspace.root;
    if (root === null) return null;
    try {
      return await invoke<string>('read_document', { root, relPath });
    } catch {
      return null;
    }
  }

  // 下の 3 つの照合はどれも開いている文書を見て動くので、1 文字打つたびに走る。読む相手は
  // ヘッダだけで決まっていて行の中身とは関係がないのに、そのたび同じファイルを読み直していた。
  // 参照先がネットワーク越しにあると 1 回が数百 ms かかり、打鍵のたびに待たされる。
  const sheetCache = createSheetCache(readSheetFile);
  const readSheet: SheetReader = (relPath) => sheetCache.read(relPath);

  // 開くフォルダが変われば相手ごと入れ替わる。控えを持ち越さない。
  $effect(() => {
    workspace.root;
    sheetCache.clear();
  });

  // 参考データ（.json / .xml）は正本ではなく、隣に置いてある資料として読むだけ。
  // 判定は開いているファイルの拡張子だけで行う（中身を覗いて形式を当てにいかない）。
  // 編集させない＝本文が変わらない＝自動保存も動かない、という順で「表示のみ」を担保する。
  const dataPath = $derived(isDataFile(workspace.activePath) ? workspace.activePath : null);
  const dataDoc = $derived(dataPath === null ? null : readDataDocument(dataPath, debouncedSource));

  // 画像は文書ではないので本文を持たない。開いている間は編集も書き出しも起きない
  // （プレビューを出さない＝[PDF] / [HTML] / [画像] の活性条件が立たない）。
  const openImage = $derived(workspace.image);
  const imageKind = $derived(openImage === null ? '' : imageKindLabel(openImage.mime));
  let imageFit = $state<ImageFitMode>('fit');
  let imageNatural = $state<{ width: number; height: number } | null>(null);
  // 別の画像へ移ったら見せ方と実寸を捨てる。前の画像の設定と数字が、大きさの違う
  // 次の画像にそのまま効く／そのまま出るのを防ぐ。
  $effect(() => {
    openImage?.relPath;
    imageFit = 'fit';
    imageNatural = null;
  });

  // 右ペインがいま何を出しているか。マークアップの分岐（時系列 → 差分 → 参考データ
  // → 画像 → 検証グリッド → プレビュー）と同じ条件で持つ。
  const paneState = $derived({
    timeline: timelineView.active,
    diff: diffView.active,
    data: dataDoc !== null,
    grid: isTsv && tsvDoc !== null,
    image: openImage !== null,
  });

  // schema / Markdown ビューワー描画中だけ [PDF] を活性化する。TSV 編集グリッドは
  // 印刷対象の iframe を持たないため対象外。
  //
  // 組み上がり（preview.ok）を確かめるのは、プレビューを出しているときだけにする。
  // preview は本文全体を HTML へ組み直す導出値なので、出していないときに読むと
  // 捨てるためだけの組み直しが 1 セル確定ごとに走る（2,000 行で 170ms）。
  // プレビューを出す面になった時点で描画一式を読み込む。グリッドや差分で開いた起動では
  // 読まない。
  $effect(() => {
    if (previewVisible(paneState)) previewRenderer.load();
  });

  $effect(() => {
    const ready = previewReady(paneState, () => preview?.ok === true);
    pdfExport.setReady(ready);
    // HTML 書き出しも同じ条件。プレビューに出せないものは書き出す中身が無い。
    htmlExport.setReady(ready);
    // 画像も同じ中身を撮るので条件は同じ。
    imageExport.setReady(ready);
  });

  // グリッド編集 → 正本ソースへ書き戻し、エディターと即同期する。
  // debouncedSource も即更新して doc を再導出し、グリッドを遅延なく反映する。
  // 併せて確定スナップショットを履歴へ積む（Ctrl+Z / Ctrl+Y で戻せるように）。
  // 控え行は編集中の doc に載っていないので、読み込み時に外したものをここで戻す。
  // 区間ごとに時間を測るのは、1 セル確定するたびにファイル全文を組み直しており、
  // どこで時間を使っているかが分からないと直す場所が決まらないため（診断タブに出る）。
  function handleGridChange(next: IdentifiedTsv, edit?: string): void {
    perf.startEdit();
    const text = perf.measure('serialize', () =>
      saveGridDoc(
        next,
        untrack(() => tsvGrid?.hidden ?? []),
        untrack(() => workspace.source),
      ),
    );
    perf.measure('history', () => {
      gridHistory = pushHistory(gridHistory, text, { key: edit });
    });
    workspace.setSource(text);
    debouncedSource = text;
    perf.finishEdit();
  }

  // 履歴の present をグリッド／正本へ反映する（undo・redo 共通のグルー）。
  function applyGridSource(text: string): void {
    workspace.setSource(text);
    debouncedSource = text;
  }

  // グリッドの Ctrl+Z。1 手戻せるなら戻し、正本と表示を同期する。
  function handleGridUndo(): void {
    const next = undoHistory(gridHistory);
    if (next === gridHistory) return;
    gridHistory = next;
    applyGridSource(next.present);
  }

  // グリッドの Ctrl+Y / Ctrl+Shift+Z。undo を取り消す。
  function handleGridRedo(): void {
    const next = redoHistory(gridHistory);
    if (next === gridHistory) return;
    gridHistory = next;
    applyGridSource(next.present);
  }

  /**
   * 別のファイルを開いた直後に、グリッドへ渡す移動先。
   *
   * グリッドは同じ部品のまま doc だけ差し替わるので、「行け」という合図が要る。
   * 同じ行を続けて指されても動くよう、連番を添える。
   */
  let gridJump = $state<{ column: string; value: string; seq: number } | null>(null);
  let gridJumpSeq = 0;

  /** 同じく、エディターへ渡すカーソル位置（別ファイルの見出しを指されたとき）。 */
  let editorCaret = $state<{ offset: number; seq: number } | null>(null);
  let editorCaretSeq = 0;

  // グリッドのセルに書いたリンクを開く。追える種類の判定は gridLink 側に集めてあり、
  // 押せる見た目とここの分岐は同じ集合を見る（見た目と挙動をずらさないため）。
  /**
   * 相対の指し先を、いま開いているファイルからの相対として開く。開けたら true。
   * グリッドのセルリンクとプレビューのリンクで導線を 1 本にする（開き方が
   * 場所ごとに違うと、開けなかったときの理由も場所ごとに変わってしまう）。
   */
  async function openRelativeDocument(path: string): Promise<boolean> {
    // リンクは書いた人が見ているファイルからの相対。開く側はルートからの相対を取る。
    const relPath = resolveRelPath(workspace.activePath, path);
    if (relPath === null) {
      workspace.reportError(t('page.linkOutsideFolder', { path }));
      return false;
    }
    // 開く導線は FileTree と同じ（差分表示を畳んでから開く。未保存分は自動保存が持つ）。
    diffView.reset();
    await workspace.select(relPath);
    // 読めなければ activePath は変わらない。理由は workspace.error に出ている。
    return workspace.activePath === relPath;
  }

  async function handleFollowLink(link: CellLink): Promise<void> {
    if (link.kind === 'external') {
      try {
        // webview 内で遷移させない（アプリの画面がリンク先で上書きされる）。
        await openUrl(link.href);
      } catch {
        // Tauri 外（素の vite プレビュー）。何もしない。
      }
      return;
    }
    // パスの無い形は同じシートの中の移動。グリッドが自分で持つのでここへは来ない。
    const path = link.path;
    if (path === null) return;

    if (!(await openRelativeDocument(path))) return;
    if (link.kind === 'row') {
      gridJump = { column: link.column, value: link.value, seq: (gridJumpSeq += 1) };
      return;
    }
    if (link.kind !== 'heading') return;
    // 見出しは開いた本文から引く。無ければ、開いたことと見つからなかったことを分けて伝える
    // （黙って先頭に居ると、指し先が消えたのか元から先頭なのか分からない）。
    const offset = findHeadingOffset(workspace.source, link.heading);
    if (offset === null) {
      workspace.reportError(t('page.linkHeadingMissing', { heading: link.heading }));
      return;
    }
    editorCaret = { offset, seq: (editorCaretSeq += 1) };
  }

  // ── 検証グリッドの全画面 ──
  // 検証中はエディター/プレビュー分割が邪魔なので、分割を畳んでグリッドを全幅にする。
  // 全画面は TSV グリッド表示中のみ意味を持ち、条件を外れれば自動で分割へ戻る（DESIGN §5.8/§6）。
  let gridFullscreen = $state(false);

  function toggleGridFullscreen(): void {
    gridFullscreen = !gridFullscreen;
  }

  // プレビュー iframe を検索対象にできる状態か（TSV グリッド／差分表示中は iframe が無い）。
  const previewSearchable = $derived(previewReady(paneState, () => preview?.ok === true));

  // Escape で全画面を抜ける。ただしセル編集中（入力にフォーカス）の Escape は入力側へ譲る。
  // また Ctrl/Cmd+F は、エディター（CodeMirror が自前で処理）／プレビュー iframe（自前で
  // postMessage）以外の親フォーカス時のフォールバックとして共通 SearchBar を開く。
  function onWindowKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      if ((event.key || '').toLowerCase() === 'f') {
        // エディターにフォーカスがあれば CodeMirror 側が既に openFor('editor') 済み＝二重で開かない。
        const el = event.target as HTMLElement | null;
        if (el?.closest?.('.cm-editor')) return;
        event.preventDefault();
        search.openFor(previewSearchable ? 'preview' : 'editor');
        return;
      }
    }
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

<div class="page-root">
{#if workspace.externalConflict}
  <!-- 開いているファイルが外部（AI/CLI/他エディタ）で変更されたが、未保存編集があるため
       自動再読込しない。どちらを採るかはユーザーが選ぶ。 -->
  <div class="conflict-bar" role="alert">
    <span class="conflict-msg">
      {t('page.conflictChanged')}（<code>{workspace.externalConflict.relPath}</code>）
    </span>
    <span class="conflict-actions">
      <button type="button" class="conflict-btn danger" onclick={() => workspace.reloadConflict()}>
        {t('page.conflictReload')}
      </button>
      <button type="button" class="conflict-btn" onclick={() => workspace.dismissConflict()}>
        {t('page.conflictKeep')}
      </button>
    </span>
  </div>
{/if}

<div
  class="split"
  class:dragging
  class:grid-full={isTsv && !!tsvDoc && gridFullscreen && !diffView.active && !timelineView.active}
  class:image-full={openImage !== null && !diffView.active && !timelineView.active}
  bind:this={splitEl}
  style="--split-cols: {dividerColumns(splitRatio)}"
>
  <section class="pane editor" aria-label={t('page.editorPaneLabel')}>
    <div class="pane-head">{t('page.editorHead')}</div>
    <!-- 読み終わるまでは枠だけ置く。ここで高さを持たせないと、届いた瞬間に
         右のプレビューごと位置がずれる。 -->
    {#await editorComponent}
      <div class="editor-loading"></div>
    {:then Editor}
      <Editor
        value={source}
        onChange={handleEditorChange}
        onSync={handleEditorSync}
        readOnly={dataDoc !== null}
        caret={editorCaret}
      />
    {/await}
    <SearchBar pane="editor" />
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
    aria-label={t('page.dividerLabel')}
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

  <section class="pane preview" aria-label={t('page.previewPaneLabel')}>
    <SearchBar pane="preview" />
    {#if timelineView.active}
      <!-- 時系列。開いている文書とは無関係に、フォルダの中のログを混ぜて出す面。
           ほかの分岐より先に見るのは、文書を開いたまま調べられるようにするため。 -->
      <TimelineView root={workspace.root ?? ''} />
    {:else if diffView.active}
      <!-- 変更ファイルをソース管理パネルでクリックした間だけ差分表示に切り替える。
           「プレビューに戻る」or 別ファイルを通常オープンで解除される。 -->
      <div class="pane-head">{t('page.diffHead')}</div>
      <DiffView />
    {:else if dataDoc}
      <!-- 参考データ（.json / .xml）。正本ではないので読むだけ＝左のエディターも読み取り専用。 -->
      <div class="pane-head data-head">
        <span>{t('page.dataHead')}</span>
        {#if dataDoc.format}<span class="chip fmt">{dataDoc.format}</span>{/if}
        <span class="chip">{t('data.readOnly')}</span>
      </div>
      <DataTreeView doc={dataDoc} />
    {:else if openImage}
      <!-- 画像。読むだけで、書き戻す先も、書き出す中身も無い。 -->
      <div class="pane-head image-head">
        <span>{t('imageView.head')}</span>
        {#if imageKind !== ''}<span class="chip fmt">{imageKind}</span>{/if}
        <span class="chip">{formatSize(openImage.byteSize)}</span>
        {#if imageNatural}
          <span class="chip">{imageNatural.width} × {imageNatural.height}</span>
        {/if}
        <span class="chip">{t('imageView.readOnly')}</span>
        <button
          type="button"
          class="head-btn"
          onclick={() => (imageFit = nextFitMode(imageFit))}
          aria-pressed={imageFit === 'actual'}
          title={imageFit === 'fit' ? t('imageView.actualTitle') : t('imageView.fitTitle')}
        >
          {imageFit === 'fit' ? t('imageView.actual') : t('imageView.fit')}
        </button>
      </div>
      <ImageView
        image={openImage}
        fit={imageFit}
        onMeasure={(size) => (imageNatural = size)}
      />
    {:else if isTsv && tsvDoc}
      <div class="pane-head grid-head">
        <span>{t('page.gridHead')}</span>
        <button
          type="button"
          class="head-btn"
          onclick={toggleGridFullscreen}
          aria-pressed={gridFullscreen}
          title={gridFullscreen ? t('page.gridRestoreTitle') : t('page.gridFullscreenTitle')}
        >
          {gridFullscreen ? t('page.gridRestoreBtn') : t('page.gridFullscreenBtn')}
        </button>
      </div>
      <div class="grid-wrap">
        <TsvGrid
          doc={tsvDoc}
          onChange={handleGridChange}
          onUndo={handleGridUndo}
          onRedo={handleGridRedo}
          reveal={revealHidden}
          onToggleReveal={() => (revealHidden = !revealHidden)}
          onFollowLink={handleFollowLink}
          jump={gridJump}
          {linkIssues}
          {counts}
          {choices}
          {blame}
          {blameOn}
          onToggleBlame={() => (blameOn = !blameOn)}
        />
      </div>
    {:else}
    <div class="pane-head preview-head">
      <span>{t('page.previewHead')}{#if preview?.ok} — {preview.label}{/if}</span>
      {#if preview?.ok}
        <button
          type="button"
          class="head-btn"
          onclick={() => (viewport = nextViewport(viewport))}
          aria-pressed={viewport === 'phone'}
          title={viewport === 'pc' ? t('page.viewportPhoneTitle') : t('page.viewportPcTitle')}
        >
          {viewport === 'pc' ? t('page.viewportPhoneBtn') : t('page.viewportPcBtn')}
        </button>
      {/if}
    </div>
    {#if preview?.ok}
      <div class="viewer-wrap" class:narrow={viewport === 'phone'}>
        <iframe
          class="viewer"
          style:width={frameWidth(viewport)}
          bind:this={viewerFrame}
          srcdoc={preview.srcdoc}
          title={t('page.previewTitle', { label: preview.label })}
          onload={onPreviewLoad}
        ></iframe>
      </div>
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
    {:else if preview}
      <div class="pane-empty">
        <p class="hint">
          {preview.problem ? frontmatterMessage(preview.problem, t) : preview.reason}
        </p>
        <span class="env">{t('page.frontmatterHint')}</span>
      </div>
    {/if}
    {/if}
  </section>
</div>
</div>

<style>
  /* 競合バナー + 分割を縦に積む器。バナーは自然高、分割が残りを占める。 */
  .page-root {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .split {
    flex: 1;
    display: grid;
    /* 比率はインラインの --split-cols で駆動。未設定時（SSR 初期）は 50/50 相当。 */
    grid-template-columns: var(--split-cols, 1fr 6px 1fr);
    min-height: 0;
  }

  /* 外部変更 × 未保存編集の競合バナー。目立つが破壊的操作は右側に隔離。 */
  .conflict-bar {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--warning-subtle, var(--accent-subtle));
    border-bottom: 1px solid var(--warning-fg, var(--border-strong));
    font-size: var(--text-xs-size);
    color: var(--text-primary);
  }

  .conflict-msg code {
    padding: 0 4px;
    border-radius: var(--radius-sm);
    background: var(--bg-subtle);
    font-family: var(--font-mono, monospace);
  }

  .conflict-actions {
    display: inline-flex;
    gap: var(--space-2);
    flex: none;
  }

  .conflict-btn {
    height: 24px;
    padding: 0 var(--space-3);
    font-size: var(--text-2xs-size);
    font-weight: var(--text-2xs-weight);
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

  .conflict-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--border-strong);
  }

  .conflict-btn.danger:hover {
    color: var(--danger-fg);
    border-color: var(--danger-fg);
  }

  .conflict-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  /* 検証グリッド全画面（DESIGN §5.8/§6）。エディター + ディバイダを畳み、グリッド（右ペイン）
     を単一カラムで全幅表示する。条件が外れれば class が落ち自動で分割へ戻る。 */
  .split.grid-full,
  .split.image-full {
    grid-template-columns: minmax(0, 1fr);
  }

  .split.grid-full .pane.editor,
  .split.grid-full .divider,
  .split.image-full .pane.editor,
  .split.image-full .divider {
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
    position: relative; /* 浮動 SearchBar（position:absolute）の基準 */
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* エディタが届くまでの場所取り。CodeMirror 側のホストと同じ伸び方にしておく。 */
  .editor-loading {
    flex: 1;
    min-height: 0;
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

  /* 参考データのペインヘッダは、見出しの右に形式と「読み取り専用」を並べる。 */
  .data-head {
    gap: var(--space-2);
  }

  /* 画像のペインヘッダは、見出しの右に種類と大きさを並べ、見せ方の切り替えを右端へ寄せる。 */
  .image-head {
    gap: var(--space-2);
  }

  .image-head .head-btn {
    margin-left: auto;
  }

  .chip {
    flex: none;
    padding: 1px var(--space-2);
    border-radius: var(--radius-full);
    background: var(--bg-subtle);
    color: var(--text-tertiary);
  }

  .chip.fmt {
    background: var(--accent-subtle);
    color: var(--accent);
  }

  /* グリッドのペインヘッダは右端に全画面トグルを置く。 */
  .grid-head,
  .preview-head {
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

  /* 枠の幅は style 属性（frameWidth）で与える。狭めたときは中央へ寄せ、周りは
     地のままにして、どこまでが枠なのかが見て分かるようにする。 */
  .viewer-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    justify-content: center;
  }

  .viewer-wrap.narrow {
    background: var(--bg-subtle);
  }

  .viewer {
    flex: none;
    height: 100%;
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

  /* < 768px: 左右分割をやめ縦積み（DESIGN §7.1・簡易対応）。
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
