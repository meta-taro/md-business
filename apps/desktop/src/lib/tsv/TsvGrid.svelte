<script lang="ts">
  /**
   * カスタム TSV 検証シートの編集グリッド（スプレッドシート化 UX）。
   *
   * Office / Workspace なしで QA が検証を完了できる本命 UI。
   * 「Excel 式モード制」を採る:
   *   - **アクティブセルのみ input 化**。非アクティブセルは軽量な静的表示。
   *   - **nav モード**: ↑↓←→でセル選択枠が動く。Enter/F2/文字入力で edit へ。
   *   - **edit モード**: キャレット編集。↑↓←→は文字内。Esc で nav、Enter で確定して下。
   * キー解決は `gridMode.planGridKey`、セル移動座標は `gridNav.nextCell`、静的表示は
   * `gridModel.cellDisplayText`、いずれも純関数として node 環境 vitest で検査済み。
   * Svelte 側はそれらを描画・フォーカス制御する薄いグルー（manual-verify）。
   */
  import { untrack } from 'svelte';
  import type { IdentifiedTsv } from '@md-business/schema-test-spec-tsv';
  import { validateTsv } from '@md-business/schema-test-spec-tsv';
  import {
    gridWidgets,
    setCell,
    checkboxToCell,
    cellToCheckbox,
    cellDisplayText,
  } from './gridModel';
  import { planGridKey, type GridMode } from './gridMode';
  import { nextCell } from './gridNav';
  import { seedFromKey } from './gridEdit';
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
    type ColAlign,
    defaultColAligns,
    setColAlign,
    colAlignMenuItems,
    groupAlign,
    alignStyle,
  } from './gridColumnAlign';
  import { spillsRight } from './gridSpill';
  import { keepsNativeContextMenu } from './gridContextMenu';
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
    extendRangeTo,
    wholeRange,
    rangeToTsv,
    rowRange,
  } from './gridRange';
  import { canStartDrag, beginDrag } from './gridDrag';
  import { displayRowCount, editPaddedCell } from './gridBlankRows';
  import { columnLabels } from './columnLabel';
  import {
    readNotes,
    writeNotes,
    applyNoteEdit,
    removeNoteAt,
    readGroups,
    groupCells,
    writeGroups,
    setGroup,
  } from './gridHeaderDirectives';
  import { readRowTints, rowTintOf } from './gridStyleDirectives';

  interface Props {
    /** 表示・編集対象の TSV ドキュメント（`parseTsv` を `withRowIds` に通した結果）。 */
    doc: IdentifiedTsv;
    /** セル編集で得た新ドキュメントを親へ通知（省略時は読み取り専用）。 */
    onChange?: (next: IdentifiedTsv) => void;
    /** ナビ中の Ctrl+Z。履歴は親（正本ソース）が持つ。 */
    onUndo?: () => void;
    /** ナビ中の Ctrl+Y / Ctrl+Shift+Z。 */
    onRedo?: () => void;
  }

  let { doc, onChange, onUndo, onRedo }: Props = $props();

  // 列型 → 入力ウィジェット仕様。列定義の変化に追従。
  const widgets = $derived(gridWidgets(doc.columns));

  // スプレッドシート列座標（A,B,C…AA,AB）。型付きヘッダとは別レイヤーの位置参照バー。
  // フォーマットは変えず、描画専用に列数から算出する。
  const colLetters = $derived(columnLabels(doc.columns.length));

  // 条件付き書式（#@ style …）。指定列の値で行全体を薄く塗り、実施状況を縦に眺めて
  // 掴めるようにする。色は tsv 側に持つので、シートごとに凡例と塗りを揃えられる。
  const rowTints = $derived(readRowTints(doc.directives, doc.columns.map((c) => c.name)));

  // 表の上の補足行（#@ note …）。型付きヘッダの上に全幅で敷く（表の上に補足を置く）。
  // フォーマット不変・#@ ディレクティブから読む。追加/編集/削除は
  // 下の note 編集セクション（applyNoteEdit / removeNoteAt / writeNotes の純ロジック）。
  const notes = $derived(readNotes(doc.directives));

  // ── 補足行のインライン編集。編集対象 index を持つ（null＝非編集）。
  //    index === notes.length は「新規追加中の下書き行」を意味する。編集ロジックは
  //    gridHeaderDirectives の純ロジック、下書き state とフォーカスだけが薄いグルー。 ──
  let editingNote = $state<number | null>(null);
  let noteDraft = $state('');
  // 新規下書き中だけ表示行が 1 本増える（既存 note＋下書き）。sticky 段の押し下げに反映。
  const noteRowCount = $derived(notes.length + (editingNote === notes.length ? 1 : 0));

  function persistNotes(next: string[]): void {
    if (!onChange) return;
    onChange({ ...doc, directives: writeNotes(doc.directives, next) });
  }
  function startNoteEdit(index: number): void {
    if (!editable) return;
    editingNote = index;
    noteDraft = notes[index] ?? '';
  }
  function startNewNote(): void {
    if (!editable) return;
    editingNote = notes.length;
    noteDraft = '';
  }
  function commitNoteEdit(): void {
    if (editingNote === null) return;
    // directives から読み直した最新 notes へ 1 件編集を適用（空なら追加/削除で解決）。
    persistNotes(applyNoteEdit(readNotes(doc.directives), editingNote, noteDraft));
    editingNote = null;
    noteDraft = '';
  }
  function cancelNoteEdit(): void {
    editingNote = null;
    noteDraft = '';
  }
  function deleteNote(index: number): void {
    if (!editable) return;
    persistNotes(removeNoteAt(readNotes(doc.directives), index));
    if (editingNote === index) cancelNoteEdit();
  }
  // note 編集 input のキー操作＝Enter で確定・Esc で取消（グリッド nav へ伝播させない）。
  function onNoteKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      commitNoteEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelNoteEdit();
    }
  }
  // 下書き input のマウント時に自動フォーカス（Svelte action・薄いグルー）。
  function noteAutofocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  // 肉厚グループヘッダ（#@ group …）。型付きヘッダ（項目/手順/結果）の上に大分類を敷く。
  // 隙間は空ラベルで全列を覆う。グループが無ければ行自体を出さない。
  const groupHeaderCells = $derived(groupCells(readGroups(doc.directives), doc.columns.length));
  const hasGroupHeader = $derived(groupHeaderCells.length > 0);

  // ── グループヘッダのインライン改名・削除。編集対象の列 span を持つ
  //    （null＝非編集）。改名 / 削除は setGroup の
  //    純ロジックで表現し、書き戻しは writeGroups 経由＝共有パッケージ非改変・#@ round-trip。 ──
  let editingGroup = $state<{ start: number; end: number } | null>(null);
  let groupDraft = $state('');
  function persistGroups(next: ReturnType<typeof setGroup>): void {
    if (onChange) onChange({ ...doc, directives: writeGroups(doc.directives, next) });
  }
  function startGroupRename(cell: { start: number; span: number; label: string }): void {
    if (!editable) return;
    editingGroup = { start: cell.start, end: cell.start + cell.span - 1 };
    groupDraft = cell.label;
  }
  function commitGroupEdit(): void {
    if (!editingGroup) return;
    persistGroups(
      setGroup(readGroups(doc.directives), editingGroup.start, editingGroup.end, groupDraft),
    );
    editingGroup = null;
    groupDraft = '';
  }
  function cancelGroupEdit(): void {
    editingGroup = null;
    groupDraft = '';
  }
  function deleteGroup(cell: { start: number; span: number }): void {
    if (!editable) return;
    persistGroups(
      setGroup(readGroups(doc.directives), cell.start, cell.start + cell.span - 1, ''),
    );
    if (editingGroup) cancelGroupEdit();
  }
  function onGroupKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      commitGroupEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelGroupEdit();
    }
  }
  // 選択中の列範囲に新規グループを張る。既定ラベルで即 setGroup 永続化し、
  // そのまま改名モードへ入れる（既定ラベルは選択済みなのでタイプで置換できる）。単一セル
  // 選択なら 1 列グループ。重なる既存は setGroup が置き換える。取消は × 削除で。
  const DEFAULT_GROUP_LABEL = 'グループ';
  function createGroupFromSelection(): void {
    if (!editable) return;
    const b = rangeBounds(selection);
    persistGroups(setGroup(readGroups(doc.directives), b.c0, b.c1, DEFAULT_GROUP_LABEL));
    editingGroup = { start: b.c0, end: b.c1 };
    groupDraft = DEFAULT_GROUP_LABEL;
  }

  // sticky 段組みの固定高（px）。座標バー→補足行→（肉厚グループ）→型付きヘッダを上から積む。
  // 補足行数とグループ有無で押し下げ量が変わるので、CSS 変数で各行の top を供給し重なりを防ぐ。
  const COORD_ROW_H = 20;
  const NOTE_ROW_H = 24;
  const GROUP_ROW_H = 30;
  const notesBottom = $derived(COORD_ROW_H + noteRowCount * NOTE_ROW_H);
  const headTop = $derived(notesBottom + (hasGroupHeader ? GROUP_ROW_H : 0));

  // ── レイアウト（列幅 px / 行高 px / 列表示モード / 列寄せ）。列幅・行高・改行時の表示・
  //    寄せを変えられるようにし、それらの状態を tsv 側に記憶するため、これらは
  //    `#@ colwidth|rowheight|colmode|align` ディレクティブとして doc に永続化する。読み書きは
  //    gridLayoutDirectives の純ロジック、リサイズ実測と永続タイミングだけが薄いグルー。
  //    編集のたび doc は再パースされ列/directives 参照が変わるが、レイアウトは directives
  //    から読み直すので、調整幅・行高・表示モードがセル入力で既定へ戻らない。 ──
  const ROWNUM_WIDTH = 44; // 行番号列の固定幅（px・.rownum の 2.75rem 相当）

  // 列型から決まる既定レイアウト（doc.columns の変化に追従して算出）。
  function layoutDefaults(): LayoutDefaults {
    return {
      colWidths: defaultColWidths(doc.columns),
      colModes: defaultColModes(doc.columns),
      colAligns: defaultColAligns(doc.columns),
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
  let colAligns = $state<ColAlign[]>(initLayout.colAligns);

  // ── 空パッド行（「行を追加しても増えない」不具合の対処）。
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
    colAligns = layout.colAligns;
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
      colAligns,
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

  // ── 行高（px）。列幅と対称。行境界のドラッグで可変。tr の height は
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

  // ── 列の表示モード（clip / wrap / overflow）と寄せ（left / center / right）。右クリック
  //    メニューで列ごとに「折り返す／突き抜ける／見切れる」と「左／中央／右寄せ」を切替。
  //    選択肢生成・状態は gridColumnMode / gridColumnAlign の純ロジック、メニュー描画・座標
  //    だけ Svelte 側の薄いグルー。状態は上のレイアウトセクションで colModes / colAligns と
  //    して宣言済み（directives から復元・変更で永続化）。 ──
  // 右クリックで開く列メニュー。対象列と画面座標を持つ（null＝非表示）。
  let colMenu = $state<{ col: number; x: number; y: number } | null>(null);
  const colMenuItems = $derived(
    colMenu ? colModeMenuItems(colModes[colMenu.col] ?? 'clip') : [],
  );
  const colAlignItems = $derived(
    colMenu ? colAlignMenuItems(colAligns[colMenu.col] ?? 'left') : [],
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
  function chooseColAlign(align: ColAlign): void {
    if (colMenu) {
      colAligns = setColAlign(colAligns, colMenu.col, align);
      persistLayout(); // 寄せを tsv へ焼く
    }
    colMenu = null;
  }
  function closeColMenu(): void {
    colMenu = null;
  }

  /**
   * 独自メニューを持たない場所（行番号列・座標バーの隅・補足行・余白）の右クリック。
   * WebView 既定のメニューはブラウザの操作を並べるだけなので、文字入力中を除いて抑止する。
   */
  function onGridContextMenu(event: MouseEvent): void {
    const target = event.target;
    const keep =
      target instanceof HTMLElement
        ? keepsNativeContextMenu({
            tagName: target.tagName,
            isContentEditable: target.isContentEditable,
          })
        : false;
    if (!keep) event.preventDefault();
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
    const res = editPaddedCell(doc.rows, doc.rowIds, padRows, row, col, value);
    padRows = res.padRows;
    onChange?.({ ...doc, rows: res.rows, rowIds: res.rowIds });
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
  // nav で印字キーを打って edit へ入るときに、生成直後の入力へ流し込む「置換用の1文字」。
  // 意図的に $state にしない＝フォーカス effect の依存に載せず、種を消す代入で effect を
  // 再実行させないため（プレーンな変数。イベント→effect の 1 回の受け渡しにだけ使う）。
  let pendingSeed: string | null = null;

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

  // アクティブセルへフォーカスを寄せる。activeCell / mode の変化にのみ追従する。
  // - nav: セルは静的表示（実ウィジェットは出さない）。キーボード操作のため静的セル自体へ
  //   フォーカスする（選択リングは td.active のクラスで描くのでフォーカス非依存）。
  // - edit: 実ウィジェットへフォーカス。印字キーで入ったとき（種あり）はその文字で値を置換、
  //   ダブルクリック / Enter / F2 で入ったとき（種なし）は既存値を全選択する。
  $effect(() => {
    const { row, col } = activeCell;
    const editing = mode === 'edit';
    if (!engaged || !gridEl) return;
    const td = gridEl.querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`);
    if (!td) return;
    if (!editing) {
      const cell = td.querySelector<HTMLElement>('.cell-active');
      if (cell && document.activeElement !== cell) cell.focus();
      return;
    }
    const input = td.querySelector<HTMLElement>('input, select, textarea');
    if (!input) return;
    if (document.activeElement !== input) input.focus();
    // 種の受け渡しは 1 回きり。untrack で読み、消す代入で effect を再実行させない。
    const seed = untrack(() => pendingSeed);
    if (
      seed !== null &&
      (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)
    ) {
      input.value = seed; // number 等は代入時にサニタイズされる
      const seeded = input.value;
      commit(row, col, seeded);
      try {
        input.setSelectionRange(seeded.length, seeded.length);
      } catch {
        // date/number 等は setSelectionRange 非対応。キャレット位置は諦めてよい。
      }
      pendingSeed = null;
    } else {
      trySelectAll(input);
    }
  });

  // マウスでの範囲選択。押したセルをアンカーに、ボタンを押したまま通ったセルまで広げる。
  // 押下 → 通過 → 離す の 3 点だけを見て、範囲の計算は gridDrag / gridRange に任せる。
  let dragging = false;

  function onCellPointerDown(row: number, col: number, event: PointerEvent): void {
    const intent = {
      button: event.button,
      shift: event.shiftKey,
      editing: isActive(row, col) && mode === 'edit',
    };
    // 右クリック（列メニュー）と編集中のウィジェット操作は、選択に奪わせない。
    if (!canStartDrag(intent)) return;
    // ドラッグ中にセルの文字が範囲選択されると、掴んだものが分からなくなる。
    // 既定の選択開始を止める（セルへのフォーカスは選択反映後の effect が行う）。
    event.preventDefault();
    dragging = true;
    engaged = true;
    selection = beginDrag(selection, { row, col }, intent, dims);
    mode = 'nav';
  }

  function onCellPointerEnter(row: number, col: number): void {
    if (!dragging) return;
    selection = extendRangeTo(selection, { row, col }, dims);
  }

  // 離すのはグリッドの外かもしれないので window で受ける（掴んだままになるのを防ぐ）。
  function endDrag(): void {
    dragging = false;
  }

  // 行番号クリック＝その行全体（先頭列〜末尾列）を範囲選択。
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
      // Shift+Home / Shift+End は行頭・行末まで一気に伸長（Ctrl 併用で表の隅まで）。
      // 移動先は修飾なしの移動と同じ nextCell に決めさせ、伸長との差を anchor 固定だけにする。
      if (event.shiftKey && (event.key === 'Home' || event.key === 'End')) {
        const to = nextCell(
          selection.focus,
          { key: event.key, ctrl: event.ctrlKey || event.metaKey },
          dims,
        );
        if (to !== null) {
          event.preventDefault();
          selection = extendRangeTo(selection, to, dims);
          return;
        }
      }
      // Ctrl+A は表全体を選択（nav 中のみ。編集中はセル入力側の全選択に譲る）。
      if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault();
        selection = wholeRange(dims);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'C')) {
        event.preventDefault();
        void copySelection();
        return;
      }
      // undo / redo は履歴を持つ親へ委譲（正本ソースが真）。編集中セルの入力は
      // それ自身のテキスト undo を使うため、ここ（nav）でだけ横取りする。
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        onUndo?.();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        onRedo?.();
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
      case 'edit': {
        // 既定動作は必ず抑止し、静的セルへ生の文字が落ちないようにする。印字1文字で入った
        // 場合はその文字を種として控え、ウィジェット生成後の effect で置換して流し込む。
        // Enter / F2 は種なし＝既存値を全選択して編集へ入る。
        event.preventDefault();
        pendingSeed = seedFromKey(widgets[col]?.kind, event.key, event.ctrlKey || event.metaKey);
        enterEdit();
        break;
      }
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
    if (!isBlock) {
      // 単一値: 編集中はフォーカス中の入力へ委ねる。nav（静的セルで入力が無い）は
      // アクティブセルへ直接流し込む（Excel の Ctrl+V 同様、選択セルを置換）。
      if (mode === 'nav') {
        event.preventDefault();
        commit(activeCell.row, activeCell.col, matrix[0]?.[0] ?? '');
      }
      return;
    }
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

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && colMenu) closeColMenu();
  }}
  onpointerup={endDrag}
  onpointercancel={endDrag}
/>

<div class="grid-shell">
  <div
    class="tsv-grid"
    role="region"
    aria-label="検証シート編集グリッド"
    bind:this={gridEl}
    onpaste={onGridPaste}
    onpointerdown={() => (engaged = true)}
    oncontextmenu={onGridContextMenu}
  >
    {#if doc.columns.length === 0}
      <p class="empty">列定義がありません（ヘッダ行のある TSV を開いてください）</p>
    {:else}
      <table style={`width:${tableWidth}px; --head-top:${headTop}px`}>
      <colgroup>
        <col style={`width:${ROWNUM_WIDTH}px`} />
        {#each doc.columns as _col, ci (ci)}
          <col style={`width:${colWidths[ci] ?? MIN_COL_WIDTH}px`} />
        {/each}
      </colgroup>
      <thead>
        <!-- スプレッドシート列座標バー（A,B,C…）。型付きヘッダの上に重ねる位置参照レイヤー。
             フォーマット不変・描画専用。列を右クリックする場所として自然なので、型付き
             ヘッダと同じ表示モードメニューをここでも開く。 -->
        <tr class="coord-row">
          <th class="rownum coord-corner" scope="col" aria-hidden="true"></th>
          {#each colLetters as letter, ci (ci)}
            <th
              class="coord-cell"
              scope="col"
              oncontextmenu={(e) => openColMenu(ci, e)}
            >{letter}</th>
          {/each}
        </tr>
        <!-- 表の上の補足行（#@ note …）。座標バーの下・型付きヘッダの上に全幅で敷く。
             行ごとに sticky top を積み上げて座標バー・上の補足と重ならないようにする。 -->
        {#each notes as note, ni (ni)}
          <tr class="note-row">
            <th
              class="rownum note-corner"
              scope="row"
              aria-hidden="true"
              style={`top:${COORD_ROW_H + ni * NOTE_ROW_H}px`}
            ></th>
            <th
              class="note-cell"
              colspan={doc.columns.length}
              scope="colgroup"
              style={`top:${COORD_ROW_H + ni * NOTE_ROW_H}px; height:${NOTE_ROW_H}px`}
            >
              <!-- 横並びは内側で組む。th 自身を flex にすると表セルでなくなり colspan が
                   無効化される（全幅のはずの補足が 1 列目の幅に潰れる）。 -->
              <div class="note-body">
                {#if editable && editingNote === ni}
                  <!-- 編集中: input 化。Enter 確定・Esc 取消・blur で確定（グリッド nav へ非伝播）。 -->
                  <input
                    class="note-input"
                    value={noteDraft}
                    use:noteAutofocus
                    oninput={(e) => (noteDraft = e.currentTarget.value)}
                    onblur={commitNoteEdit}
                    onkeydown={onNoteKeydown}
                  />
                {:else if editable}
                  <!-- クリックで編集（セル同様の 1 クリック→編集は補足では過剰なので即編集）。× で削除。 -->
                  <button
                    type="button"
                    class="note-text"
                    title="クリックで補足を編集"
                    onclick={() => startNoteEdit(ni)}
                  >{note}</button>
                  <button
                    type="button"
                    class="note-del"
                    title="この補足を削除"
                    aria-label="この補足を削除"
                    onclick={() => deleteNote(ni)}
                  >×</button>
                {:else}
                  <span class="note-text-ro" title={note}>{note}</span>
                {/if}
              </div>
            </th>
          </tr>
        {/each}
        {#if editable && editingNote === notes.length}
          <!-- 新規追加中の下書き行（まだ directives に無い）。確定で writeNotes へ焼く。 -->
          <tr class="note-row">
            <th
              class="rownum note-corner"
              scope="row"
              aria-hidden="true"
              style={`top:${COORD_ROW_H + notes.length * NOTE_ROW_H}px`}
            ></th>
            <th
              class="note-cell"
              colspan={doc.columns.length}
              scope="colgroup"
              style={`top:${COORD_ROW_H + notes.length * NOTE_ROW_H}px; height:${NOTE_ROW_H}px`}
            >
              <div class="note-body">
                <input
                  class="note-input"
                  value={noteDraft}
                  use:noteAutofocus
                  placeholder="補足を入力…（Enter で確定・Esc で取消）"
                  oninput={(e) => (noteDraft = e.currentTarget.value)}
                  onblur={commitNoteEdit}
                  onkeydown={onNoteKeydown}
                />
              </div>
            </th>
          </tr>
        {/if}
        <!-- 肉厚グループヘッダ（#@ group …）。型付きヘッダの上に大分類を敷く。隙間セルは
             空ラベルで全列を覆う。補足行の下・型付きヘッダの上に sticky で載せる。 -->
        {#if hasGroupHeader}
          <tr class="group-row">
            <th class="rownum group-corner" scope="col" aria-hidden="true" style={`top:${notesBottom}px`}></th>
            {#each groupHeaderCells as cell, gi (gi)}
              <!-- 大分類の寄せは所属列の指定に従う（割れていれば中央）。 -->
              {@const gAlign = alignStyle(groupAlign(colAligns, cell.start, cell.span))}
              <th
                class="group-cell"
                class:group-filled={cell.label !== ''}
                colspan={cell.span}
                scope="colgroup"
                title={cell.label}
                style={`top:${notesBottom}px; height:${GROUP_ROW_H}px; ${gAlign}`}
              >
                <!-- ラベルの横並びは内側で組む（th を flex にすると colspan が効かず、
                     列をまたぐはずの大分類が 1 列目へ潰れる）。 -->
                <div class="group-body" style={gAlign}>
                  {#if editable && cell.label !== '' && editingGroup?.start === cell.start}
                    <!-- 改名中: input 化。Enter 確定・Esc 取消・blur 確定（グリッド nav へ非伝播）。 -->
                    <input
                      class="group-input"
                      value={groupDraft}
                      use:noteAutofocus
                      oninput={(e) => (groupDraft = e.currentTarget.value)}
                      onblur={commitGroupEdit}
                      onkeydown={onGroupKeydown}
                    />
                  {:else if editable && cell.label !== ''}
                    <!-- クリックで大分類を改名。× で削除（下の型付きヘッダ/列は保持）。 -->
                    <button
                      type="button"
                      class="group-text"
                      title="クリックで大分類を改名"
                      onclick={() => startGroupRename(cell)}
                    >{cell.label}</button>
                    <button
                      type="button"
                      class="group-del"
                      title="この大分類を削除"
                      aria-label="この大分類を削除"
                      onclick={() => deleteGroup(cell)}
                    >×</button>
                  {:else}<span class="group-text-ro">{cell.label}</span>{/if}
                </div>
              </th>
            {/each}
          </tr>
        {/if}
        <tr class="head-row">
          <th class="rownum" scope="col" aria-label="行番号"></th>
          {#each doc.columns as column, col (col)}
            <th
              scope="col"
              class:required={column.required}
              style={alignStyle(colAligns[col] ?? 'left')}
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
          {@const tint = rowTintOf(rowTints, doc.rows[r] ?? [])}
          <tr
            style={`height:${rowHeights[r] ?? DEFAULT_ROW_HEIGHT}px${tint ? `; --row-tint:${tint}` : ''}`}
          >
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
              {@const cellAlign = alignStyle(colAligns[c] ?? 'left')}
              {@const spill =
                colModes[c] === 'clip' &&
                widget?.kind !== 'number' &&
                spillsRight(doc.rows[r] ?? [], c, doc.columns.length)}
              <td
                class:invalid={issue !== undefined}
                class:active
                class:selected={inSelection(r, c)}
                class:editing={active && mode === 'edit'}
                title={issue}
                data-cell={`${r}-${c}`}
                onkeydown={(e) => onGridKeydown(r, c, e)}
                onpointerdown={(e) => onCellPointerDown(r, c, e)}
                onpointerenter={() => onCellPointerEnter(r, c)}
                oncontextmenu={(e) => openColMenu(c, e)}
                ondblclick={enterEdit}
              >
                {#if !active}
                  <!-- 非アクティブ＝静的表示。選択（nav）は td の onpointerdown が持つ
                       （クリックとドラッグを 1 か所で受けるため）。キーボード操作は
                       td の onkeydown（nav⇄edit）で提供済み。 -->
                  <div
                    class="cell-view"
                    class:num={widget?.kind === 'number'}
                    class:wrap={colModes[c] === 'wrap'}
                    class:overflow={colModes[c] === 'overflow'}
                    class:spill
                    style={cellAlign}
                  >
                    {cellDisplayText(widget?.kind, value)}
                  </div>
                {:else if editable && mode === 'edit'}
                  <!-- アクティブかつ編集モード＝実ウィジェット。ダブルクリック / Enter / F2 /
                       文字入力で入る（単一クリックは選択のまま＝静的表示のブランチへ）。 -->
                  <div class="cell-edit" style={cellAlign} role="presentation">
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
                {:else}
                  <!-- アクティブだが nav（または読み取り専用）＝静的表示。値をそのまま見せ、
                       選択リングは td.active が描く。キーボード操作のため focus 可能にし、
                       ダブルクリック（td の ondblclick）や Enter/F2/文字入力で編集へ入る。 -->
                  <div
                    class="cell-view cell-active"
                    class:num={widget?.kind === 'number'}
                    class:wrap={colModes[c] === 'wrap'}
                    class:overflow={colModes[c] === 'overflow'}
                    class:spill
                    style={cellAlign}
                    tabindex="-1"
                  >
                    {cellDisplayText(widget?.kind, value)}
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
      <!-- 表の上の補足行を 1 本追加（#@ note …）。「表の上に補足」の編集導線。 -->
      <button type="button" class="row-btn" onclick={startNewNote}>＋ 補足行</button>
      <!-- 選択中の列範囲に肉厚グループ（大分類）を張る（#@ group …）。既定名で作って即改名。 -->
      <button
        type="button"
        class="row-btn"
        onclick={createGroupFromSelection}
        title="選択中の列に大分類（グループ見出し）を作成"
      >＋ グループ</button>
      <span class="active-row" aria-live="polite">
        {modeLabel}中: {activeRowLabel}{#if selectionLabel} · {selectionLabel}{/if}
      </span>
    </div>
  {/if}

  {#if colMenu}
    <!-- 列の表示モード / 寄せのカスタム右クリックメニュー。背後クリック /
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
      <!-- 寄せは型付きヘッダ・データセル・大分類（所属列の指定に従う）へ同時に効く。 -->
      <li class="col-menu-head" role="presentation">寄せ</li>
      {#each colAlignItems as item (item.align)}
        <li role="none">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={item.checked}
            class="col-menu-item"
            class:checked={item.checked}
            onclick={() => chooseColAlign(item.align)}
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
     アクティブセルのみ入力ウィジェット化、選択枠（リング）で今どこかを示す。DESIGN §5.3 の
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

  /* 条件付き書式（#@ style）の行背景。--row-tint は行ごとにインラインで入るので、
     色の組み立てはこの行側でしか成立しない（テーマ側の変数に組んでも、そこでは
     --row-tint が未設定のまま「色なし」に確定し、その結果が全行へ継承される）。
     選択・編集中のセルは td 側の背景が上に乗るので、色付き行でも現在位置は見失わない。 */
  tbody tr {
    /* ライトは tsv の色をそのまま敷く（濃度 100%）。相対色が使えないエンジンでは
       ダークもここに落ちる（濃度を下げるので色味は薄れるが、明度差だけは付く）。 */
    background: color-mix(in srgb, var(--row-tint, transparent) var(--row-tint-strength), transparent);
  }

  @supports (background: oklch(from red l c h)) {
    /* ダークは明度を暗い地に合わせて置き換え、彩度は逆に持ち上げて色の違いだけを残す
       （数値の意図はテーマトークン側のコメント参照）。元が透明な行は透明のまま。 */
    :global(:root[data-theme='dark']) tbody tr {
      background: oklch(
        from var(--row-tint, #0000) var(--row-tint-dark-l) min(c * 3, var(--row-tint-dark-c-max)) h
      );
    }
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

  /* 型付きヘッダ行は座標行（20px）＋補足行のぶん下げて重ならないよう sticky する。
     補足行数は可変なので押し下げ量は --head-top（table に inline 供給）で受ける。 */
  .head-row th {
    top: var(--head-top, 20px);
  }

  /* ── 表の上の補足行（#@ note …）。座標バーと型付きヘッダの間に全幅で敷く注記帯。
     top は行ごとに inline（座標バー + 上の補足の積み上げ）。 ── */
  .note-row th {
    height: 24px;
    padding: 0 var(--space-3);
    text-align: left;
    font-weight: var(--text-2xs-weight);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 補足セルは全列にまたがる 1 セル（colspan）。表セルのまま置くことが幅の条件なので、
     display は触らない。 */
  .note-cell {
    font-size: var(--text-2xs-size, var(--text-sm-size));
  }

  /* 「本文（伸長）＋削除ボタン」/ 編集 input の横並びはセルの内側で組む。 */
  .note-body {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 100%;
    min-width: 0;
  }

  /* 補足本文はボタンだが地に溶かして「クリックで編集できるテキスト」に見せる。 */
  .note-text {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: text;
  }

  .note-text:hover {
    color: var(--text-primary);
  }

  .note-text-ro {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 削除 × は控えめ。ホバーで危険色に。 */
  .note-del {
    flex: none;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 4px);
    background: transparent;
    color: var(--text-tertiary);
    font: inherit;
    line-height: 1;
    cursor: pointer;
  }

  .note-del:hover {
    background: var(--bg-hover);
    color: var(--danger-fg);
  }

  /* 補足の編集 input はセル地に馴染ませる（罫線なし・全幅）。 */
  .note-input {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
  }

  .note-input:focus {
    outline: none;
  }

  .note-corner {
    z-index: 4; /* 補足行の左端（行番号列との交点）も両 sticky の最前面 */
  }

  /* ── 肉厚グループヘッダ（#@ group …）。大分類を型付きヘッダの上に載せる。ラベルを持つ
     セルは太字・中央寄せで「肉厚」に、隙間の空セルは地に馴染ませる。 ── */
  .group-row th {
    height: 30px;
    padding: 0 var(--space-3);
    text-align: center;
    font-weight: var(--text-sm-weight);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-bottom: 1px solid var(--border-strong);
  }

  /* ラベルを持つセルの地と仕切り。列をまたぐ幅は colspan で決まるので display は触らない。 */
  .group-filled {
    color: var(--text-primary);
    background: var(--bg-muted, var(--bg-subtle));
    border-right: 1px solid var(--border-strong);
  }

  /* ラベル＋削除ボタン / 改名 input の横並びはセルの内側で組む（寄せは inline 指定）。 */
  .group-body {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    height: 100%;
    min-width: 0;
  }

  /* 大分類ラベルはボタンだが地に溶かして「クリックで改名できる見出し」に見せる。 */
  .group-text {
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: var(--text-sm-weight);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: text;
  }

  /* 読み取り専用の大分類。ellipsis は flex コンテナでは効かないので、テキスト側に持たせる。 */
  .group-text-ro {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .group-del {
    flex: none;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 4px);
    background: transparent;
    color: var(--text-tertiary);
    font: inherit;
    line-height: 1;
    cursor: pointer;
  }

  .group-del:hover {
    background: var(--bg-hover);
    color: var(--danger-fg);
  }

  /* 改名 input はセル地に馴染ませる（罫線なし・中央寄せ・全幅）。 */
  .group-input {
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-weight: var(--text-sm-weight);
    text-align: inherit;
  }

  .group-input:focus {
    outline: none;
  }

  .group-corner {
    z-index: 4; /* グループ行の左端（行番号列との交点）も両 sticky の最前面 */
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
     box-shadow inset が背の高い折り返しセルだと下辺しか出ない。
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
     （省略だけでなく折り返して全文を見せる）。 */
  .cell-view.wrap {
    display: block;
    white-space: pre-wrap;
    overflow: hidden;
    height: auto;
    min-height: 30px;
    line-height: 1.5;
    word-break: break-word;
  }

  /* 突き抜けモード: 折り返さず、セル幅を超えた分は省略せず
     隣セル方向へはみ出して全文を見せる（スプレの既定挙動）。改行は無視して 1 行に。 */
  .cell-view.overflow {
    white-space: nowrap;
    overflow: visible;
    text-overflow: clip;
  }

  /* clip 列の空セルへの自動突き抜け（スプレ既定）。右隣が空のときだけ overflow の見せ方を
     借りて長文を隣へ流す（spillsRight が判定）。列モードを overflow に切り替えなくても、
     既定表示のまま右が空いていれば全文を読める。右隣に中身がある列は clip のまま省略。 */
  .cell-view.spill {
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

  /* 入力中の文字位置は静的表示と同じ寄せに揃える（編集へ入った瞬間に文字が飛ばない）。
     寄せは .cell-edit の inline 指定を親から受け取る。 */
  .cell-edit input,
  .cell-edit select,
  .cell-edit textarea {
    text-align: inherit;
  }

  /* 数値列はスピナー矢印を隠す（列幅を食う・スプレにない）。寄せは列指定（既定は右）に従う。 */
  input[type='number'] {
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

  /* チェックボックス / ラジオも列の寄せに従う（横位置は .cell-edit の inline 指定が決める）。 */
  .cell-edit:has(> input[type='checkbox']),
  .cell-edit:has(> .radio-group) {
    display: flex;
    align-items: center;
  }

  input[type='checkbox'] {
    margin: 0;
  }

  .radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--space-3);
    justify-content: inherit;
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

  /* 2 つ目以降の見出し（寄せ）は罫線で区切り、上のまとまりと混ざらないようにする。 */
  .col-menu-head:not(:first-child) {
    margin-top: var(--space-1);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
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
