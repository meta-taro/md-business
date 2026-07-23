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
  import type { CellPos } from './gridNav';
  import { planGridKey, type GridMode } from './gridMode';
  import { parseClipboardMatrix, applyPaste, rowToTsv } from './gridClipboard';
  import { appendRow, duplicateRow, deleteRow, clearRow } from './gridRows';
  import { MIN_COL_WIDTH, defaultColWidths, resizeColWidth, setColWidth } from './gridLayout';

  interface Props {
    /** 表示・編集対象の TSV ドキュメント（`parseTsv` の結果）。 */
    doc: TsvDocument;
    /** セル編集で得た新ドキュメントを親へ通知（省略時は読み取り専用）。 */
    onChange?: (next: TsvDocument) => void;
  }

  let { doc, onChange }: Props = $props();

  // 列型 → 入力ウィジェット仕様。列定義の変化に追従。
  const widgets = $derived(gridWidgets(doc.columns));

  // ── 列幅（px）。table-layout:fixed の土台。選択（input 化）で幅が動かず、
  //    ヘッダ境界のドラッグで自由に調整できる（田中さん 2026-07-23）。 ──
  const ROWNUM_WIDTH = 44; // 行番号列の固定幅（px・.rownum の 2.75rem 相当）
  // 初期幅はマウント時の列定義から一度だけ確定（untrack で「初期値キャプチャ」を明示）。
  let colWidths = $state<number[]>(untrack(() => defaultColWidths(doc.columns)));
  // 列定義が差し替わった（別ファイルを開いた）ときだけ既定幅へ戻す。setCell は
  // columns 参照を保つので、セル編集ではユーザーの調整幅を維持する。
  let lastColumnsRef = untrack(() => doc.columns);
  $effect(() => {
    if (doc.columns !== lastColumnsRef) {
      lastColumnsRef = doc.columns;
      colWidths = defaultColWidths(doc.columns);
    }
  });
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
    onChange?.(setCell(doc, row, col, value));
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
  const dims = $derived({ rows: doc.rows.length, cols: doc.columns.length });

  // アクティブセル（選択枠 / 貼り付けの起点）と現在モード。
  let activeCell = $state<CellPos>({ row: 0, col: 0 });
  let mode = $state<GridMode>('nav');
  // ユーザーが一度でもグリッドに触れたか。マウント時にフォーカスを勝手に奪わないためのガード。
  let engaged = $state(false);

  const isActive = (row: number, col: number): boolean =>
    activeCell.row === row && activeCell.col === col;

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

  function selectCell(row: number, col: number): void {
    engaged = true;
    activeCell = { row, col };
    mode = 'nav';
  }

  function enterEdit(): void {
    if (editable) mode = 'edit';
  }

  function onGridKeydown(row: number, col: number, event: KeyboardEvent): void {
    engaged = true;
    const multiline = event.target instanceof HTMLTextAreaElement;
    const action = planGridKey(
      { key: event.key, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey },
      { row, col },
      dims,
      { mode, multiline },
    );
    switch (action.kind) {
      case 'move':
        event.preventDefault();
        activeCell = action.to; // mode は nav のまま
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
        activeCell = action.to;
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
    onChange?.(applyPaste(doc, activeCell, text));
  }

  // ── 行操作（下部アクションバー）。対象は「選択中の行」＝アンカーセルの行。 ──
  const hasRows = $derived(doc.rows.length > 0);
  const activeRowLabel = $derived(hasRows ? `${activeCell.row + 1} 行目` : '—');
  const modeLabel = $derived(mode === 'edit' ? '編集' : '選択');

  function addRow(): void {
    onChange?.(appendRow(doc));
  }
  function duplicateActiveRow(): void {
    if (hasRows) onChange?.(duplicateRow(doc, activeCell.row));
  }
  function deleteActiveRow(): void {
    if (hasRows) onChange?.(deleteRow(doc, activeCell.row));
  }
  function clearActiveRow(): void {
    if (hasRows) onChange?.(clearRow(doc, activeCell.row));
  }

  // 選択行を TSV（タブ区切り）でクリップボードへ。失敗（権限・非対応）は握り潰す。
  async function copyActiveRow(): Promise<void> {
    if (!hasRows) return;
    try {
      await navigator.clipboard.writeText(rowToTsv(doc, activeCell.row));
    } catch {
      // クリップボード API 不許可の環境では無視（検証作業を止めない）
    }
  }
</script>

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
        <tr>
          <th class="rownum" scope="col" aria-label="行番号"></th>
          {#each doc.columns as column, col (col)}
            <th scope="col" class:required={column.required}>
              <span class="colname">{column.name}</span>
              {#if column.required}<span class="req" aria-label="必須">*</span>{/if}
              <!-- 列幅リサイズのグリップ。掴んで左右ドラッグで列幅を変える（スプレ同様）。
                   キーボードでの列幅調整は未提供（マウス操作の補助 UI）。 -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span
                class="col-resize"
                role="separator"
                aria-orientation="vertical"
                aria-label={`${column.name} 列の幅を変更`}
                onpointerdown={(e) => onResizeStart(col, e)}
                onpointermove={onResizeMove}
                onpointerup={onResizeEnd}
              ></span>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each doc.rows as row, r (r)}
          <tr>
            <th class="rownum" scope="row">{r + 1}</th>
            {#each doc.columns as _column, c (c)}
              {@const widget = widgets[c]}
              {@const value = cellValue(r, c)}
              {@const issue = issueOf(r, c)}
              {@const active = isActive(r, c)}
              <td
                class:invalid={issue !== undefined}
                class:active
                class:editing={active && mode === 'edit'}
                title={issue}
                data-cell={`${r}-${c}`}
                onkeydown={(e) => onGridKeydown(r, c, e)}
              >
                {#if !active}
                  <!-- 非アクティブ＝静的表示。クリックで選択（nav）。キーボード操作は
                       td の onkeydown（nav⇄edit）で提供済みのため click 単独で問題ない。 -->
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    class="cell-view"
                    class:num={widget?.kind === 'number'}
                    class:wrap={widget?.kind === 'multiline'}
                    role="button"
                    tabindex="-1"
                    onclick={() => selectCell(r, c)}
                  >
                    {cellDisplayText(widget?.kind, value)}
                  </div>
                {:else}
                  <!-- アクティブ＝実ウィジェット。クリックで編集（edit）へ。 -->
                  <div class="cell-edit" role="presentation" onpointerup={enterEdit}>
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
      <button type="button" class="row-btn" onclick={duplicateActiveRow} disabled={!hasRows}>
        選択行を複製
      </button>
      <button type="button" class="row-btn" onclick={copyActiveRow} disabled={!hasRows}>
        選択行をコピー
      </button>
      <button type="button" class="row-btn" onclick={clearActiveRow} disabled={!hasRows}>
        選択行をクリア
      </button>
      <button type="button" class="row-btn danger" onclick={deleteActiveRow} disabled={!hasRows}>
        選択行を削除
      </button>
      <span class="active-row" aria-live="polite">{modeLabel}中: {activeRowLabel}</span>
    </div>
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

  .req {
    color: var(--danger-fg);
    margin-left: 2px;
  }

  /* 検証エラー: 左内側マーカー + 淡い赤地。選択枠とは併存する。 */
  td.invalid {
    background: var(--danger-subtle, rgba(220, 38, 38, 0.08));
    box-shadow: inset 3px 0 0 var(--danger-fg);
  }

  /* アクティブセル＝選択リング（Excel の選択枠相当）。編集中は地を少し変える。 */
  td.active {
    box-shadow: inset 0 0 0 2px var(--accent);
    background: var(--accent-subtle);
  }

  td.active.editing {
    background: var(--bg-elevated);
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
</style>
