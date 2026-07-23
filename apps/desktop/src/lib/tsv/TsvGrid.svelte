<script lang="ts">
  /**
   * カスタム TSV 検証シートの編集グリッド（Issue 010・スプレッドシート化 UX）。
   *
   * Office / Workspace なしで QA が検証を完了できる本命 UI。田中さん 2026-07-23 決定の
   * 「Excel 式モード制」を採る:
   *   - **アクティブセルのみ input 化**。非アクティブセルは軽量な静的表示。
   *   - **nav モード**: ↑↓←→でセル選択枠が動く。Enter/F2/文字入力で edit へ。
   *   - **edit モード**: キャレット編集。↑↓←→は文字内。Esc で nav、Enter で確定して下。
   * キー解決は `gridMode.planGridKey`、セル移動座標は `gridNav.nextCell`、静的表示は
   * `gridModel.cellDisplayText`、いずれも純関数として node 環境 vitest で検査済み。
   * Svelte 側はそれらを描画・フォーカス制御する薄いグルー（manual-verify）。
   */
  import { untrack } from 'svelte';
  import type { TsvDocument } from '@md-business/schema-test-spec-tsv';
  import { validateTsv } from '@md-business/schema-test-spec-tsv';
  import {
    gridWidgets,
    setCell,
    checkboxToCell,
    cellToCheckbox,
    cellDisplayText,
  } from './gridModel';
  import { planGridKey, type GridMode } from './gridMode';
  import { parseClipboardMatrix, applyPaste, rowToTsv } from './gridClipboard';
  import { duplicateRow, deleteRow, clearRow } from './gridRows';
  import {
    MIN_COL_WIDTH,
    defaultColWidths,
    resizeColWidth,
    setColWidth,
    fitColWidth,
  } from './gridLayout';
  import {
    DEFAULT_ROW_HEIGHT,
    resizeRowHeight,
    setRowHeight,
  } from './gridRowLayout';
  import {
    type ColOverflowMode,
    defaultColModes,
    setColMode,
    colModeMenuItems,
  } from './gridColumnMode';
  import {
    readLayout,
    writeLayoutDirectives,
    type LayoutDefaults,
    type GridLayout,
  } from './gridLayoutDirectives';
  import {
    type CellRange,
    rangeBounds,
    isInRange,
    isSingleCell,
    extendRange,
    rangeToTsv,
    rowRange,
  } from './gridRange';
  import { displayRowCount, editPaddedCell } from './gridBlankRows';
  import { columnLabels } from './columnLabel';

  interface Props {
    /** 表示・編集対象の TSV ドキュメント（`parseTsv` の結果）。 */
    doc: TsvDocument;
    /** セル編集で得た新ドキュメントを親へ通知（省略時は読み取り専用）。 */
    onChange?: (next: TsvDocument) => void;
  }

  let { doc, onChange }: Props = $props();

  // 列型 → 入力ウィジェット仕様。列定義の変化に追従。
  const widgets = $derived(gridWidgets(doc.columns));

  // スプレッドシート列座標（A,B,C…AA,AB）。型付きヘッダとは別レイヤーの位置参照バー
  // （田中さん 2026-07-23）。フォーマットは変えず、描画専用に列数から算出する。
  const colLetters = $derived(columnLabels(doc.columns.length));

  // ── レイアウト（列幅 px / 行高 px / 列表示モード）。田中さん 2026-07-23「幅や、行を
  //    変えられる…改行時の表示も。これは tsv 側に記憶してほしい」に応え、これらは
  //    `#@ colwidth|rowheight|colmode` ディレクティブとして doc に永続化する。読み書きは
  //    gridLayoutDirectives の純ロジック、リサイズ実測と永続タイミングだけが薄いグルー。
  //    編集のたび doc は再パースされ列/directives 参照が変わるが、レイアウトは directives
  //    から読み直すので、調整幅・行高・表示モードがセル入力で既定へ戻らない。 ──
  const ROWNUM_WIDTH = 44; // 行番号列の固定幅（px・.rownum の 2.75rem 相当）

  // 列型から決まる既定レイアウト（doc.columns の変化に追従して算出）。
  function layoutDefaults(): LayoutDefaults {
    return {
      colWidths: defaultColWidths(doc.columns),
      colModes: defaultColModes(doc.columns),
      rowHeight: DEFAULT_ROW_HEIGHT,
    };
  }

  // 初期レイアウトは directives から復元（untrack で「初期値キャプチャ」を明示）。
  const initLayout = untrack(() =>
    readLayout(doc.directives, doc.rows.length, layoutDefaults()),
  );
  let colWidths = $state<number[]>(initLayout.colWidths);
  let rowHeights = $state<number[]>(initLayout.rowHeights);
  let colModes = $state<ColOverflowMode[]>(initLayout.colModes);

  // ── 空パッド行（田中さん 2026-07-23「行を追加しても増えない」不具合の対処）。
  //    カスタム TSV は全セルが空の行をテキスト化できない（round-trip で消える）ため、
  //    「行追加」直後の空行はファイルに焼けない。スプレッドシート同様、値が入るまでは
  //    ローカルの pad 行として画面に出し、値が入った時点で実データ行へ実体化する。
  //    表示行数・実体化・空行判定は gridBlankRows の純ロジックへ委譲。 ──
  let padRows = $state(0);
  const displayRows = $derived(displayRowCount(doc.rows.length, padRows));

  // doc（別ファイル or 再パース）に追従してレイアウトを directives から読み直す。列参照は
  // 毎編集で変わるので ref 比較では「別ファイル」を判定できない。構造シグネチャ（列名:型:
  // 必須）で本当に列構成が変わったときだけ pad 行をリセットする（同一ファイルの再パースは維持）。
  function columnSignature(): string {
    return doc.columns.map((c) => `${c.name}:${c.type}:${c.required ? 1 : 0}`).join('\t');
  }
  let lastSignature = untrack(() => columnSignature());
  $effect(() => {
    // readLayout / columnSignature が doc.directives・doc.columns・doc.rows.length を読むので、
    // それらの変化でこの effect が再走する（明示的な依存宣言は不要）。
    const layout = readLayout(doc.directives, doc.rows.length, layoutDefaults());
    colWidths = layout.colWidths;
    rowHeights = layout.rowHeights;
    colModes = layout.colModes;
    const sig = columnSignature();
    if (sig !== lastSignature) {
      lastSignature = sig;
      padRows = 0; // 別ファイルを開いたら空パッド行はリセット
    }
  });

  // レイアウト変更（幅/行高/モード）を #@ ディレクティブへ焼いて親へ通知＝tsv に永続化。
  // pad 行の高さはファイルに焼けない（実データ行でない）ため data 行ぶんに切り詰める。
  function persistLayout(): void {
    if (!onChange) return;
    const layout: GridLayout = {
      colWidths,
      colModes,
      rowHeights: rowHeights.slice(0, doc.rows.length),
    };
    const directives = writeLayoutDirectives(doc.directives, layout, layoutDefaults());
    onChange({ ...doc, directives });
  }
  // テーブル全幅＝行番号列 + 各列幅の合計（fixed レイアウトで横スクロール可能に）。
  const tableWidth = $derived(ROWNUM_WIDTH + colWidths.reduce((sum, w) => sum + w, 0));

  // ヘッダ境界ドラッグでの列幅リサイズ（pointer capture でカーソルが外れても追従）。
  let resizing: { col: number; startX: number; startW: number } | null = null;
  function onResizeStart(col: number, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    resizing = { col, startX: event.clientX, startW: colWidths[col] ?? MIN_COL_WIDTH };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function onResizeMove(event: PointerEvent): void {
    if (!resizing) return;
    const dx = event.clientX - resizing.startX;
    colWidths = setColWidth(colWidths, resizing.col, resizeColWidth(resizing.startW, dx));
  }
  function onResizeEnd(event: PointerEvent): void {
    if (!resizing) return;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // pointer capture 非対応環境でも無視（リサイズは終了扱い）
    }
    resizing = null;
    persistLayout(); // 調整幅を tsv へ焼く
  }

  // 列境界のダブルクリック＝内容に合わせた自動幅（スプレ同様）。ヘッダ名と各セルの
  // テキストをオフスクリーン span で実測し、fitColWidth（純ロジック）で幅を決める。
  // 実測は DOM 依存の薄いグルー（manual-verify）。改行セルは行ごとに測り最長を採る。
  function autoFitColumn(col: number): void {
    if (!gridEl) return;
    const sampleCell =
      gridEl.querySelector<HTMLElement>('tbody .cell-view') ??
      gridEl.querySelector<HTMLElement>('thead .colname');
    const sampleHeader = gridEl.querySelector<HTMLElement>('thead .colname') ?? sampleCell;
    const span = document.createElement('span');
    span.style.cssText =
      'position:absolute;visibility:hidden;white-space:pre;top:-9999px;left:-9999px';
    gridEl.appendChild(span);
    const widthOf = (text: string, sample: HTMLElement | null): number => {
      if (sample) {
        const cs = getComputedStyle(sample);
        span.style.fontSize = cs.fontSize;
        span.style.fontFamily = cs.fontFamily;
        span.style.fontWeight = cs.fontWeight;
        span.style.letterSpacing = cs.letterSpacing;
      }
      let max = 0;
      for (const line of text.split(/\r?\n/)) {
        span.textContent = line;
        max = Math.max(max, span.getBoundingClientRect().width);
      }
      return max;
    };
    const measured: number[] = [widthOf(doc.columns[col]?.name ?? '', sampleHeader)];
    for (let r = 0; r < doc.rows.length; r++) {
      const value = cellValue(r, col);
      if (value !== '') measured.push(widthOf(value, sampleCell));
    }
    span.remove();
    colWidths = setColWidth(colWidths, col, fitColWidth(measured));
    persistLayout(); // 自動幅も tsv へ焼く
  }

  // ── 行高（px）。列幅と対称。行境界のドラッグで可変（田中さん 2026-07-23）。tr の height は
  //    最小高として効くので、折り返し内容がそれより高ければ内容が伸びる。状態は上のレイアウト
  //    セクションで rowHeights として宣言済み（directives から復元・変更で永続化）。 ──
  let rowResizing: { row: number; startY: number; startH: number } | null = null;
  function onRowResizeStart(row: number, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    rowResizing = { row, startY: event.clientY, startH: rowHeights[row] ?? DEFAULT_ROW_HEIGHT };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function onRowResizeMove(event: PointerEvent): void {
    if (!rowResizing) return;
    const dy = event.clientY - rowResizing.startY;
    rowHeights = setRowHeight(rowHeights, rowResizing.row, resizeRowHeight(rowResizing.startH, dy));
  }
  function onRowResizeEnd(event: PointerEvent): void {
    if (!rowResizing) return;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // pointer capture 非対応環境でも無視
    }
    rowResizing = null;
    persistLayout(); // 行高を tsv へ焼く
  }
  // 行境界のダブルクリック＝既定高へ戻す（内容＝折り返しに応じた自然な高さに任せる）。
  function autoFitRow(row: number): void {
    rowHeights = setRowHeight(rowHeights, row, DEFAULT_ROW_HEIGHT);
    persistLayout(); // 既定へ戻した行高も tsv へ焼く（既定なら sparse で行が消える）
  }

  // ── 列の表示モード（clip / wrap / overflow）。右クリックメニューで列ごとに切替
  //    （田中さん 2026-07-23「折り返す／突き抜ける／見切れる」）。選択肢生成・状態は
  //    gridColumnMode の純ロジック、メニュー描画・座標だけ Svelte 側の薄いグルー。状態は
  //    上のレイアウトセクションで colModes として宣言済み（directives から復元・変更で永続化）。 ──
  // 右クリックで開く列モードメニュー。対象列と画面座標を持つ（null＝非表示）。
  let colMenu = $state<{ col: number; x: number; y: number } | null>(null);
  const colMenuItems = $derived(
    colMenu ? colModeMenuItems(colModes[colMenu.col] ?? 'clip') : [],
  );
  function openColMenu(col: number, event: MouseEvent): void {
    event.preventDefault(); // WebView2 ネイティブメニューを抑止しカスタムメニューを出す
    colMenu = { col, x: event.clientX, y: event.clientY };
  }
  function chooseColMode(mode: ColOverflowMode): void {
    if (colMenu) {
      colModes = setColMode(colModes, colMenu.col, mode);
      persistLayout(); // 表示モードを tsv へ焼く
    }
    colMenu = null;
  }
  function closeColMenu(): void {
    colMenu = null;
  }

  // 型検査。セル位置ごとの最初の違反メッセージを引けるようにする。
  const issueByCell = $derived.by(() => {
    const map = new Map<string, string>();
    for (const issue of validateTsv(doc)) {
      const key = `${issue.row}:${issue.column}`;
      if (!map.has(key)) map.set(key, issue.message);
    }
    return map;
  });

  function cellValue(row: number, col: number): string {
    return doc.rows[row]?.[col] ?? '';
  }

  function issueOf(row: number, col: number): string | undefined {
    return issueByCell.get(`${row}:${col}`);
  }

  function commit(row: number, col: number, value: string): void {
    // 実データ行はそのまま setCell（挙動不変）。pad 行（実データ末尾より下）への入力は
    // gridBlankRows で実体化し、pad 数を詰め直してから通知する。
    if (row < doc.rows.length) {
      onChange?.(setCell(doc, row, col, value));
      return;
    }
    const res = editPaddedCell(doc.rows, padRows, row, col, value);
    padRows = res.padRows;
    onChange?.({ ...doc, rows: res.rows });
  }

  // datetime-local 入力は `YYYY-MM-DDTHH:MM`（T 区切り）を期待する。正本セルは
  // 空白区切りもあり得るため、表示用に T へ寄せる（保存値は入力が返す T 形式のまま）。
  function toDatetimeInput(value: string): string {
    return value.replace(' ', 'T');
  }

  // 複数行セルの textarea を内容に合わせて縦に伸ばす（スプレッドシート同様に行高が
  // 増える・折り返す）。field-sizing 非対応の WebView でも効くよう scrollHeight で調整。
  function autogrow(node: HTMLTextAreaElement) {
    const resize = () => {
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    };
    resize();
    node.addEventListener('input', resize);
    return {
      destroy() {
        node.removeEventListener('input', resize);
      },
    };
  }

  // ── nav ⇄ edit 二モードのキーボード操作（決定は gridMode の純ロジックに委譲） ──
  let gridEl: HTMLDivElement | undefined;
  // nav / 範囲選択は pad 行も含めた表示行数を上限にする（矢印で空行へ入れる）。
  const dims = $derived({ rows: displayRows, cols: doc.columns.length });

  // 選択範囲（anchor＝起点固定・focus＝伸長先＝アクティブセル）と現在モード。
  // 単一セル選択は anchor === focus。Shift+矢印 / Shift+クリックで矩形に広げる。
  let selection = $state<CellRange>({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
  // アクティブセル＝範囲の focus 角（input 化・フォーカス・行操作の対象はここ）。
  const activeCell = $derived(selection.focus);
  let mode = $state<GridMode>('nav');
  // ユーザーが一度でもグリッドに触れたか。マウント時にフォーカスを勝手に奪わないためのガード。
  let engaged = $state(false);

  const isActive = (row: number, col: number): boolean =>
    activeCell.row === row && activeCell.col === col;
  // 範囲内かつ focus セルでない＝範囲ハイライト（focus は選択リングで示す）。
  const inSelection = (row: number, col: number): boolean =>
    isInRange(selection, row, col) && !isActive(row, col);
  // 矢印キー → 範囲拡張の移動量。
  const ARROW_DELTA: Record<string, { dr: number; dc: number }> = {
    ArrowUp: { dr: -1, dc: 0 },
    ArrowDown: { dr: 1, dc: 0 },
    ArrowLeft: { dr: 0, dc: -1 },
    ArrowRight: { dr: 0, dc: 1 },
  };

  const editable = $derived(onChange !== undefined);

  // テキスト系のみ全選択できる（date/number/select に select() すると例外の環境がある）。
  function trySelectAll(el: HTMLElement): void {
    try {
      if (el instanceof HTMLTextAreaElement) el.select();
      else if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'url')) el.select();
    } catch {
      // 一部の input 型は select() 非対応。フォーカスだけで十分。
    }
  }

  // アクティブセルの input へフォーカスを寄せる。nav では値を全選択して「選択セル」の
  // 見た目にし、タイプで置換できるようにする。activeCell / mode の変化にのみ追従。
  $effect(() => {
    const { row, col } = activeCell;
    const editing = mode === 'edit';
    if (!engaged || !gridEl) return;
    const td = gridEl.querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`);
    const input = td?.querySelector<HTMLElement>('input, select, textarea');
    if (!input) return;
    if (document.activeElement !== input) input.focus();
    if (!editing) trySelectAll(input);
  });

  function selectCell(row: number, col: number, extend = false): void {
    engaged = true;
    // Shift+クリック＝アンカーを保って範囲を広げる。通常クリックは単一セルへ畳む。
    selection = extend
      ? { anchor: selection.anchor, focus: { row, col } }
      : { anchor: { row, col }, focus: { row, col } };
    mode = 'nav';
  }

  // 行番号クリック＝その行全体（先頭列〜末尾列）を範囲選択（田中さん 2026-07-23）。
  function selectWholeRow(row: number): void {
    engaged = true;
    selection = rowRange(row, doc.columns.length);
    mode = 'nav';
  }

  // 選択ブロックを TSV（タブ区切り × 改行）でクリップボードへ。失敗は握り潰す。
  async function copySelection(): Promise<void> {
    try {
      await navigator.clipboard.writeText(rangeToTsv(doc, selection));
    } catch {
      // クリップボード API 不許可の環境では無視（検証作業を止めない）
    }
  }

  function enterEdit(): void {
    if (editable) mode = 'edit';
  }

  function onGridKeydown(row: number, col: number, event: KeyboardEvent): void {
    engaged = true;
    const multiline = event.target instanceof HTMLTextAreaElement;
    // nav 中の範囲操作は planGridKey より先に横取り（Excel 同様の Shift+矢印 / Ctrl+C）。
    if (mode === 'nav') {
      const delta = ARROW_DELTA[event.key];
      if (event.shiftKey && delta) {
        event.preventDefault();
        selection = extendRange(selection, delta, dims);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'C')) {
        event.preventDefault();
        void copySelection();
        return;
      }
    }
    const action = planGridKey(
      { key: event.key, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey },
      { row, col },
      dims,
      { mode, multiline },
    );
    switch (action.kind) {
      case 'move':
        event.preventDefault();
        // 修飾なし移動＝選択を移動先セルへ畳む（mode は nav のまま）。
        selection = { anchor: action.to, focus: action.to };
        break;
      case 'edit':
        // 印字文字は preventDefault せず、全選択中の値へ上書きさせる（Excel 式の置換入力）。
        // Enter / F2 は文字を持たないので抑止してから編集へ入る。
        if (event.key === 'Enter' || event.key === 'F2') event.preventDefault();
        enterEdit();
        break;
      case 'commit-move':
        event.preventDefault();
        mode = 'nav';
        selection = { anchor: action.to, focus: action.to };
        break;
      case 'cancel':
        event.preventDefault();
        mode = 'nav'; // 同セルに留まり、effect が全選択し直す
        break;
      case 'clear':
        event.preventDefault();
        if (editable) commit(row, col, '');
        break;
      case 'pass':
        break;
    }
  }

  // Excel / Sheets からの矩形貼り付け。複数セル（タブ/改行を含む）だけ横取りし、
  // 単一値は通常どおりフォーカス中の入力へ委ねる。
  function onGridPaste(event: ClipboardEvent): void {
    if (!editable) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const matrix = parseClipboardMatrix(text);
    const isBlock = matrix.length > 1 || matrix.some((cells) => cells.length > 1);
    if (!isBlock) return; // 単一セルは入力へ委ねる
    event.preventDefault();
    // 範囲選択中は左上を起点に流し込む（単一セル選択では focus と同じ）。
    const { r0, c0 } = rangeBounds(selection);
    onChange?.(applyPaste(doc, { row: r0, col: c0 }, text));
  }

  // ── 行操作（下部アクションバー）。対象は「選択中の行」＝アンカーセルの行。 ──
  const hasRows = $derived(doc.rows.length > 0);
  const activeRowLabel = $derived(hasRows ? `${activeCell.row + 1} 行目` : '—');
  const modeLabel = $derived(mode === 'edit' ? '編集' : '選択');
  // 複数セル選択時だけ「行×列」を出す（単一セルは空＝ノイズにしない）。
  const selectionLabel = $derived.by(() => {
    if (isSingleCell(selection)) return '';
    const b = rangeBounds(selection);
    return `${b.r1 - b.r0 + 1}×${b.c1 - b.c0 + 1} 選択`;
  });

  // 実データ末尾より下＝pad 行（まだファイルに焼けない空行）。複製/削除/クリア/コピーは
  // 実データ行にだけ意味があるので pad 行では抑止する。
  const activeIsData = $derived(activeCell.row < doc.rows.length);

  function addRow(): void {
    // ファイルに焼けない空行なので onChange せず、ローカル pad を 1 増やして即座に見せる。
    padRows += 1;
  }
  function duplicateActiveRow(): void {
    if (activeIsData) onChange?.(duplicateRow(doc, activeCell.row));
  }
  function deleteActiveRow(): void {
    if (activeIsData) onChange?.(deleteRow(doc, activeCell.row));
    else if (padRows > 0) padRows -= 1; // pad 行の削除はローカル pad を 1 減らす
  }
  function clearActiveRow(): void {
    if (activeIsData) onChange?.(clearRow(doc, activeCell.row));
  }

  // 選択行を TSV（タブ区切り）でクリップボードへ。失敗（権限・非対応）は握り潰す。
  async function copyActiveRow(): Promise<void> {
    if (!activeIsData) return;
    try {
      await navigator.clipboard.writeText(rowToTsv(doc, activeCell.row));
    } catch {
      // クリップボード API 不許可の環境では無視（検証作業を止めない）
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && colMenu) closeColMenu(); }} />

<div class="grid-shell">
  <div
    class="tsv-grid"
    role="region"
    aria-label="検証シート編集グリッド"
    bind:this={gridEl}
    onpaste={onGridPaste}
    onpointerdown={() => (engaged = true)}
  >
    {#if doc.columns.length === 0}
      <p class="empty">列定義がありません（ヘッダ行のある TSV を開いてください）</p>
    {:else}
      <table style={`width:${tableWidth}px`}>
      <colgroup>
        <col style={`width:${ROWNUM_WIDTH}px`} />
        {#each doc.columns as _col, ci (ci)}
          <col style={`width:${colWidths[ci] ?? MIN_COL_WIDTH}px`} />
        {/each}
      </colgroup>
      <thead>
        <!-- スプレッドシート列座標バー（A,B,C…）。型付きヘッダの上に重ねる位置参照レイヤー。
             フォーマット不変・描画専用（田中さん 2026-07-23）。 -->
        <tr class="coord-row">
          <th class="rownum coord-corner" scope="col" aria-hidden="true"></th>
          {#each colLetters as letter, ci (ci)}
            <th class="coord-cell" scope="col">{letter}</th>
          {/each}
        </tr>
        <tr class="head-row">
          <th class="rownum" scope="col" aria-label="行番号"></th>
          {#each doc.columns as column, col (col)}
            <th
              scope="col"
              class:required={column.required}
              oncontextmenu={(e) => openColMenu(col, e)}
            >
              <span class="colname">{column.name}</span>
              {#if column.required}<span class="req" aria-label="必須">*</span>{/if}
              <!-- 列幅リサイズのグリップ。掴んで左右ドラッグで列幅を変える（スプレ同様）。
                   ダブルクリックで内容に合わせた自動幅。キーボード列幅調整は未提供。 -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span
                class="col-resize"
                role="separator"
                aria-orientation="vertical"
                aria-label={`${column.name} 列の幅を変更`}
                title="ドラッグで幅変更／ダブルクリックで自動幅"
                onpointerdown={(e) => onResizeStart(col, e)}
                onpointermove={onResizeMove}
                onpointerup={onResizeEnd}
                ondblclick={() => autoFitColumn(col)}
              ></span>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        <!-- 実データ行 + pad 空行を通し番号で描く。pad 行のセルは cellValue が '' を返す。 -->
        {#each Array(displayRows) as _row, r (r)}
          <tr style={`height:${rowHeights[r] ?? DEFAULT_ROW_HEIGHT}px`}>
            <!-- 行番号クリックで行全体を選択（スプレ同様）。下端のグリップは行高リサイズ。 -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <th class="rownum rownum-select" scope="row" onclick={() => selectWholeRow(r)}>
              {r + 1}
              <!-- 行高リサイズのグリップ（行番号セル下端）。ドラッグで高さ変更、
                   ダブルクリックで既定高に戻す。キーボード操作は未提供。 -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span
                class="row-resize"
                role="separator"
                aria-orientation="horizontal"
                aria-label={`${r + 1} 行目の高さを変更`}
                title="ドラッグで高さ変更／ダブルクリックで既定に戻す"
                onpointerdown={(e) => onRowResizeStart(r, e)}
                onpointermove={onRowResizeMove}
                onpointerup={onRowResizeEnd}
                ondblclick={() => autoFitRow(r)}
              ></span>
            </th>
            {#each doc.columns as _column, c (c)}
              {@const widget = widgets[c]}
              {@const value = cellValue(r, c)}
              {@const issue = issueOf(r, c)}
              {@const active = isActive(r, c)}
              <td
                class:invalid={issue !== undefined}
                class:active
                class:selected={inSelection(r, c)}
                class:editing={active && mode === 'edit'}
                title={issue}
                data-cell={`${r}-${c}`}
                onkeydown={(e) => onGridKeydown(r, c, e)}
                oncontextmenu={(e) => openColMenu(c, e)}
                ondblclick={enterEdit}
              >
                {#if !active}
                  <!-- 非アクティブ＝静的表示。クリックで選択（nav）。キーボード操作は
                       td の onkeydown（nav⇄edit）で提供済みのため click 単独で問題ない。 -->
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    class="cell-view"
                    class:num={widget?.kind === 'number'}
                    class:wrap={colModes[c] === 'wrap'}
                    class:overflow={colModes[c] === 'overflow'}
                    role="button"
                    tabindex="-1"
                    onclick={(e) => selectCell(r, c, e.shiftKey)}
                  >
                    {cellDisplayText(widget?.kind, value)}
                  </div>
                {:else}
                  <!-- アクティブ＝実ウィジェット。ダブルクリック（td の ondblclick）で編集へ。
                       単一クリックは選択のまま（スプレ式・田中さん 2026-07-23）。 -->
                  <div class="cell-edit" role="presentation">
                    {#if widget === undefined}
                      <span class="plain">{value}</span>
                    {:else if widget.kind === 'checkbox'}
                      <input
                        type="checkbox"
                        checked={cellToCheckbox(value)}
                        onchange={(e) => commit(r, c, checkboxToCell(e.currentTarget.checked))}
                      />
                    {:else if widget.kind === 'select'}
                      <select value={value} onchange={(e) => commit(r, c, e.currentTarget.value)}>
                        <option value=""></option>
                        {#each widget.options ?? [] as opt (opt)}
                          <option value={opt}>{opt}</option>
                        {/each}
                      </select>
                    {:else if widget.kind === 'radio'}
                      <div class="radio-group" role="radiogroup" aria-label={doc.columns[c]?.name}>
                        {#each widget.options ?? [] as opt (opt)}
                          <label class="radio">
                            <input
                              type="radio"
                              name={`cell-${r}-${c}`}
                              value={opt}
                              checked={value === opt}
                              onchange={() => commit(r, c, opt)}
                            />
                            <span>{opt}</span>
                          </label>
                        {/each}
                      </div>
                    {:else if widget.kind === 'multiline'}
                      <textarea
                        class="multiline"
                        rows="1"
                        value={value}
                        use:autogrow
                        oninput={(e) => commit(r, c, e.currentTarget.value)}
                      ></textarea>
                    {:else if widget.kind === 'date'}
                      <input
                        type="date"
                        value={value}
                        oninput={(e) => commit(r, c, e.currentTarget.value)}
                      />
                    {:else if widget.kind === 'datetime'}
                      <input
                        type="datetime-local"
                        value={toDatetimeInput(value)}
                        oninput={(e) => commit(r, c, e.currentTarget.value)}
                      />
                    {:else if widget.kind === 'number'}
                      <input
                        type="number"
                        value={value}
                        oninput={(e) => commit(r, c, e.currentTarget.value)}
                      />
                    {:else if widget.kind === 'url'}
                      <input
                        type="url"
                        value={value}
                        oninput={(e) => commit(r, c, e.currentTarget.value)}
                      />
                    {:else}
                      <input
                        type="text"
                        value={value}
                        oninput={(e) => commit(r, c, e.currentTarget.value)}
                      />
                    {/if}
                  </div>
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {/if}
  </div>

  {#if editable && doc.columns.length > 0}
    <!-- 行操作バー。対象は「選択中の行」＝アクティブセルの行。 -->
    <div class="grid-actions">
      <button type="button" class="row-btn" onclick={addRow}>＋ 行を追加</button>
      <button type="button" class="row-btn" onclick={duplicateActiveRow} disabled={!activeIsData}>
        選択行を複製
      </button>
      <button type="button" class="row-btn" onclick={copyActiveRow} disabled={!activeIsData}>
        選択行をコピー
      </button>
      <button type="button" class="row-btn" onclick={clearActiveRow} disabled={!activeIsData}>
        選択行をクリア
      </button>
      <button
        type="button"
        class="row-btn danger"
        onclick={deleteActiveRow}
        disabled={!activeIsData && padRows === 0}
      >
        選択行を削除
      </button>
      <span class="active-row" aria-live="polite">
        {modeLabel}中: {activeRowLabel}{#if selectionLabel} · {selectionLabel}{/if}
      </span>
    </div>
  {/if}

  {#if colMenu}
    <!-- 列表示モードのカスタム右クリックメニュー（田中さん 2026-07-23）。背後クリック /
         右クリック / Esc で閉じる。ネイティブ WebView2 メニューは openColMenu で抑止済み。 -->
    <button
      type="button"
      class="menu-backdrop"
      aria-label="メニューを閉じる"
      onclick={closeColMenu}
      oncontextmenu={(e) => { e.preventDefault(); closeColMenu(); }}
    ></button>
    <ul class="col-menu" role="menu" style={`left:${colMenu.x}px; top:${colMenu.y}px`}>
      <li class="col-menu-head" role="presentation">
        {doc.columns[colMenu.col]?.name} 列のテキスト表示
      </li>
      {#each colMenuItems as item (item.mode)}
        <li role="none">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={item.checked}
            class="col-menu-item"
            class:checked={item.checked}
            onclick={() => chooseColMode(item.mode)}
          >
            <span class="check" aria-hidden="true">{item.checked ? '✓' : ''}</span>
            {item.label}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* グリッド本体（スクロール）＋下部の行操作バーを縦に積む器。ペイン高さいっぱい。 */
  .grid-shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  /* DESIGN §5.8: 検証グリッドはスプレッドシート（Excel / Sheets）調。罫線＝セル境界、
     アクティブセルのみ入力ウィジェット化、選択枠（リング）で今どこかを示す。§5.3 の
     読み取り表とは別仕様。 */
  .tsv-grid {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--bg-app);
  }

  /* 行操作バー: グリッド下端に固定（スクロールしない）。控えめな地で罫線で区切る。 */
  .grid-actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--border);
    background: var(--bg-subtle);
  }

  .row-btn {
    height: 26px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-app);
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease);
  }

  .row-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--border-strong);
  }

  .row-btn.danger:hover:not(:disabled) {
    color: var(--danger-fg);
    border-color: var(--danger-fg);
  }

  .row-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
    color: var(--text-primary);
  }

  .row-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .active-row {
    margin-left: auto;
    font-size: var(--text-2xs-size, var(--text-sm-size));
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  table {
    border-collapse: collapse;
    /* 列幅は colgroup の px（table-layout:fixed）で確定。選択（input 化）で列が広がらない。
       テーブル全幅は列幅合計を inline style で与える＝多列時は横スクロールで縦罫が途切れない。 */
    table-layout: fixed;
    min-width: 100%;
    font-size: var(--text-sm-size);
  }

  /* 縦横の罫線＝セル境界（スプレッドシート）。全セルの右・下に 1px。 */
  th,
  td {
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    text-align: left;
    padding: var(--space-1) var(--space-3);
    height: 30px;
    white-space: nowrap;
    font-weight: var(--text-2xs-weight);
    color: var(--text-secondary);
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border-strong);
  }

  /* 列幅リサイズのグリップ（ヘッダ右端の当たり判定）。thead th は sticky = 位置指定済み
     なので absolute はこの th を基準に載る。掴んで左右ドラッグで列幅を変える。 */
  .col-resize {
    position: absolute;
    top: 0;
    right: 0;
    width: 7px;
    height: 100%;
    cursor: col-resize;
    z-index: 4;
    touch-action: none;
    user-select: none;
  }

  .col-resize:hover,
  .col-resize:active {
    background: var(--accent);
    opacity: 0.5;
  }

  /* 行高リサイズのグリップ（行番号セル下端の当たり判定）。.rownum は sticky = 位置指定済み
     なので absolute はこの th を基準に載る。掴んで上下ドラッグで行高を変える（列幅と対称）。 */
  .row-resize {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 6px;
    cursor: row-resize;
    z-index: 2;
    touch-action: none;
    user-select: none;
  }

  .row-resize:hover,
  .row-resize:active {
    background: var(--accent);
    opacity: 0.5;
  }

  tbody td {
    padding: 0; /* 入力ウィジェット / 静的表示がセルいっぱいに敷くので td 自身は余白ゼロ */
    height: 30px;
    vertical-align: middle;
  }

  /* 行番号列＝横スクロールでも固定（sticky left）。左上隅も固定。 */
  .rownum {
    width: 2.75rem;
    min-width: 2.75rem;
    text-align: center;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
    font-weight: var(--text-2xs-weight);
    background: var(--bg-subtle);
    position: sticky;
    left: 0;
    z-index: 1;
  }

  thead .rownum {
    z-index: 3; /* 隅は行番号（left sticky）とヘッダ（top sticky）の交点で最前面 */
  }

  /* ── スプレッドシート列座標バー（A,B,C…）。thead 最上段に薄く敷く位置参照レイヤー。
     座標行を top:0 で固定し、型付きヘッダ行はその高さぶん下げて二段 sticky にする。 ── */
  .coord-row th {
    top: 0;
    height: 20px;
    padding: 0;
    text-align: center;
    color: var(--text-tertiary);
    font-weight: var(--text-2xs-weight);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }

  .coord-cell {
    font-size: var(--text-2xs-size, var(--text-sm-size));
  }

  /* 型付きヘッダ行は座標行（20px）のぶん下げて重ならないよう sticky する。 */
  .head-row th {
    top: 20px;
  }

  /* 左上隅（座標×行番号の交点）は両 sticky の最前面。座標バーと地を揃える。 */
  .coord-corner {
    z-index: 4;
  }

  /* 行番号セルはクリックで行全体を選択できる＝ポインタカーソルで示す。 */
  .rownum-select {
    cursor: pointer;
  }

  .rownum-select:hover {
    color: var(--text-secondary);
    background: var(--bg-hover);
  }

  .req {
    color: var(--danger-fg);
    margin-left: 2px;
  }

  /* 検証エラー: 左内側マーカー + 淡い赤地。選択枠とは併存する。 */
  td.invalid {
    background: var(--danger-subtle, rgba(220, 38, 38, 0.08));
    box-shadow: inset 3px 0 0 var(--danger-fg);
  }

  /* 範囲選択のセル（focus 以外）＝淡いアクセント地。focus セルは選択リングで示す。
     Shift+矢印 / Shift+クリックで広げたブロックを Ctrl+C でコピーできる。 */
  td.selected {
    background: var(--accent-subtle);
  }

  /* アクティブセル＝選択リング（Excel の選択枠相当）。編集中は地を少し変える。 */
  td.active {
    position: relative;
    background: var(--accent-subtle);
  }

  td.active.editing {
    background: var(--bg-elevated);
  }

  /* 選択リングはセル全体を囲むオーバーレイで描く。border-collapse 下では
     box-shadow inset が背の高い折り返しセルだと下辺しか出ない（田中さん 2026-07-23）。
     ::after を inset:0 で四辺 border にすれば行高に依らず全周を囲める。 */
  td.active::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 2px solid var(--accent);
    pointer-events: none;
    z-index: 3;
  }

  /* 非アクティブの静的表示。1 行で省略、セルいっぱいに敷く。 */
  .cell-view {
    display: flex;
    align-items: center;
    height: 100%;
    padding: var(--space-1) var(--space-3);
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: cell;
    outline: none;
  }

  .cell-view.num {
    justify-content: flex-end;
    font-variant-numeric: tabular-nums;
  }

  /* 複数行セル（非アクティブ）: 固定列幅内で折り返し、行高が内容に応じて伸びる
     （田中さん 2026-07-23「省略だけでなく折り返して全文を見せたい」）。 */
  .cell-view.wrap {
    display: block;
    white-space: pre-wrap;
    overflow: hidden;
    height: auto;
    min-height: 30px;
    line-height: 1.5;
    word-break: break-word;
  }

  /* 突き抜けモード（田中さん 2026-07-23）: 折り返さず、セル幅を超えた分は省略せず
     隣セル方向へはみ出して全文を見せる（スプレの既定挙動）。改行は無視して 1 行に。 */
  .cell-view.overflow {
    white-space: nowrap;
    overflow: visible;
    text-overflow: clip;
  }

  /* アクティブセルの入力コンテナ。 */
  .cell-edit {
    display: block;
    height: 100%;
  }

  /* 入力ウィジェットは枠なし・角丸なし・透明でセルいっぱい（罫線がセルを区切る）。
     min-width は付けない＝選択（input 化）で列幅が広がらない（静的表示と同じ幅）。 */
  input[type='text'],
  input[type='url'],
  input[type='number'],
  input[type='date'],
  input[type='datetime-local'],
  select,
  textarea {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
  }

  /* ダークテーマでネイティブ dropdown が白背景＋白文字で消えないよう、option を明示配色。
     select 自体はセルに溶け込む透明のまま、開いた候補リストだけテーマ地に載せる。 */
  option {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  /* 数値列は右寄せ（表計算の慣習）。スピナー矢印は隠す（列幅を食う・スプレにない）。 */
  input[type='number'] {
    text-align: right;
    font-variant-numeric: tabular-nums;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  input[type='number']::-webkit-outer-spin-button,
  input[type='number']::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* 複数行セル（編集中）: 折り返し + 内容に応じて行高が伸びる（autogrow が height を実値に）。
     非アクティブの折り返し表示は .cell-view.wrap が担う。 */
  textarea.multiline {
    resize: none;
    line-height: 1.5;
    overflow: hidden;
    white-space: pre-wrap;
    height: auto;
    min-height: 30px;
    background: var(--bg-elevated);
  }

  /* チェックボックス / ラジオはセル中央に。 */
  .cell-edit:has(> input[type='checkbox']),
  .cell-edit:has(> .radio-group) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  input[type='checkbox'] {
    margin: 0 auto;
  }

  .radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--space-3);
    justify-content: center;
    padding: 0 var(--space-2);
  }

  .radio {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .plain {
    display: block;
    padding: var(--space-1) var(--space-3);
    color: var(--text-primary);
  }

  .empty {
    padding: var(--space-6);
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--text-sm-size);
  }

  /* ── 列表示モードのカスタム右クリックメニュー ── */
  /* 背後クリックを拾う透明バックドロップ。メニュー外クリックで閉じる。 */
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: transparent;
    border: none;
    padding: 0;
    cursor: default;
  }

  .col-menu {
    position: fixed;
    z-index: 51;
    min-width: 172px;
    margin: 0;
    padding: var(--space-1);
    list-style: none;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.28));
    font-size: var(--text-sm-size);
  }

  .col-menu-head {
    padding: var(--space-1) var(--space-2);
    color: var(--text-tertiary);
    font-size: var(--text-2xs-size, var(--text-sm-size));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .col-menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm, 4px);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .col-menu-item:hover {
    background: var(--bg-hover);
  }

  .col-menu-item.checked {
    color: var(--accent);
  }

  .col-menu-item .check {
    display: inline-block;
    width: 1em;
    text-align: center;
  }
</style>
