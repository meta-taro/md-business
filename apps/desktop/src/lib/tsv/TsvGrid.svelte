<script lang="ts">
  /**
   * カスタム TSV 検証シートの編集グリッド（Issue 010・Block TSV-8）。
   *
   * Office / Workspace なしで QA が検証を完了できる本命 UI。列型ごとの入力ウィジェット
   * （チェックボックス / ドロップダウン / ラジオ / 日付・日時ピッカー / 数値 / URL /
   * テキストエリア）でセルを直接編集し、`setCell` で **不変** に反映した新ドキュメントを
   * `onChange` へ渡す。決定ロジック（列型→ウィジェット・checkbox 値写像）は
   * `gridModel` に純関数として切り出し、node 環境の vitest で検査済み。
   */
  import type { TsvDocument } from '@md-business/schema-test-spec-tsv';
  import { validateTsv } from '@md-business/schema-test-spec-tsv';
  import {
    gridWidgets,
    setCell,
    checkboxToCell,
    cellToCheckbox,
  } from './gridModel';
  import { planCellKeydown, type CellPos } from './gridNav';
  import { parseClipboardMatrix, applyPaste } from './gridClipboard';

  interface Props {
    /** 表示・編集対象の TSV ドキュメント（`parseTsv` の結果）。 */
    doc: TsvDocument;
    /** セル編集で得た新ドキュメントを親へ通知（省略時は読み取り専用）。 */
    onChange?: (next: TsvDocument) => void;
  }

  let { doc, onChange }: Props = $props();

  // 列型 → 入力ウィジェット仕様。列定義の変化に追従。
  const widgets = $derived(gridWidgets(doc.columns));

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

  // ── スプレッドシート風のキーボード移動（決定は gridNav の純ロジックに委譲） ──
  let gridEl: HTMLDivElement | undefined;
  const dims = $derived({ rows: doc.rows.length, cols: doc.columns.length });

  // アンカーセル（貼り付けの起点）。セルにフォーカスが入るたび追従する。
  let activeCell = $state<CellPos>({ row: 0, col: 0 });

  // select() が意味を持つのはテキスト系のみ（date/datetime に呼ぶと例外になる環境がある）。
  const SELECTABLE = new Set(['text', 'url', 'number']);

  function focusCell(pos: CellPos): void {
    const td = gridEl?.querySelector<HTMLElement>(`[data-cell="${pos.row}-${pos.col}"]`);
    const control = td?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    );
    if (!control) return;
    control.focus();
    if (control instanceof HTMLTextAreaElement) control.select();
    else if (control instanceof HTMLInputElement && SELECTABLE.has(control.type)) control.select();
  }

  function onCellKeydown(row: number, col: number, event: KeyboardEvent): void {
    const multiline = event.target instanceof HTMLTextAreaElement;
    const plan = planCellKeydown(
      { key: event.key, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey },
      { row, col },
      dims,
      { multiline },
    );
    if (plan.kind !== 'move') return; // 入力へ委ねる（カーソル移動・改行・グリッド外への Tab）
    event.preventDefault();
    focusCell(plan.to);
  }

  // Excel / Sheets からの矩形貼り付け。複数セル（タブ/改行を含む）だけ横取りし、
  // 単一値は通常どおりフォーカス中の入力へ委ねる。
  function onGridPaste(event: ClipboardEvent): void {
    if (!onChange) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const matrix = parseClipboardMatrix(text);
    const isBlock = matrix.length > 1 || matrix.some((cells) => cells.length > 1);
    if (!isBlock) return; // 単一セルは入力へ委ねる
    event.preventDefault();
    onChange(applyPaste(doc, activeCell, text));
  }
</script>

<div
  class="tsv-grid"
  role="region"
  aria-label="検証シート編集グリッド"
  bind:this={gridEl}
  onpaste={onGridPaste}
>
  {#if doc.columns.length === 0}
    <p class="empty">列定義がありません（ヘッダ行のある TSV を開いてください）</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th class="rownum" scope="col" aria-label="行番号"></th>
          {#each doc.columns as column, col (col)}
            <th scope="col" class:required={column.required}>
              <span class="colname">{column.name}</span>
              {#if column.required}<span class="req" aria-label="必須">*</span>{/if}
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
              <td
                class:invalid={issue !== undefined}
                title={issue}
                data-cell={`${r}-${c}`}
                onkeydown={(e) => onCellKeydown(r, c, e)}
                onfocusin={() => (activeCell = { row: r, col: c })}
              >
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
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  /* DESIGN §5.8: 検証グリッドはスプレッドシート（Excel / Sheets）調。罫線＝セル境界、
     セルは枠なし透明でその場編集、アクティブセルは選択リング。§5.3 の読み取り表とは別仕様。 */
  .tsv-grid {
    height: 100%;
    overflow: auto;
    background: var(--bg-app);
  }

  table {
    border-collapse: collapse;
    /* 内容幅で伸ばしつつ最低でも全幅。多列時は横スクロールで縦罫が途切れない。 */
    width: max-content;
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

  tbody td {
    padding: 0; /* 入力ウィジェットがセルいっぱいに敷くので td 自身は余白ゼロ */
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

  /* 検証エラー: 左内側マーカー + 淡い赤地。フォーカスリングとは併存する。 */
  td.invalid {
    background: var(--danger-subtle, rgba(220, 38, 38, 0.08));
    box-shadow: inset 3px 0 0 var(--danger-fg);
  }

  /* アクティブセル＝選択リング（Excel の選択枠相当）。地は微かに敷く。 */
  tbody td:focus-within {
    box-shadow: inset 0 0 0 2px var(--accent);
    background: var(--accent-subtle);
  }

  /* 入力ウィジェットは枠なし・角丸なし・透明でセルいっぱい（罫線がセルを区切る）。 */
  input[type='text'],
  input[type='url'],
  input[type='number'],
  input[type='date'],
  input[type='datetime-local'],
  select,
  textarea {
    width: 100%;
    min-width: 7rem;
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

  /* 数値列は右寄せ（表計算の慣習）。 */
  input[type='number'] {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* 複数行セル: 既定は 1 行でクリップ（行を詰める）。フォーカス時だけ縦に開いて全文編集。 */
  textarea.multiline {
    resize: none;
    line-height: 1.5;
    overflow: hidden;
    white-space: pre;
    min-height: 30px;
  }

  textarea.multiline:focus {
    min-height: 4.5em;
    overflow: auto;
    white-space: pre-wrap;
    box-shadow: inset 0 0 0 2px var(--accent);
    background: var(--bg-elevated);
  }

  /* チェックボックス / ラジオはセル中央に。 */
  td:has(> input[type='checkbox']),
  td:has(> .radio-group) {
    text-align: center;
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
