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
</script>

<div class="tsv-grid" role="region" aria-label="検証シート編集グリッド">
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
              <td class:invalid={issue !== undefined} title={issue}>
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
                    rows="2"
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
  /* DESIGN §5.3: 行の水平ヘアラインのみ・縦罫なし・空セルは空のまま。 */
  .tsv-grid {
    height: 100%;
    overflow: auto;
    background: var(--bg-app);
  }

  table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--text-sm-size);
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    text-align: left;
    padding: var(--space-2) var(--space-3);
    white-space: nowrap;
    font-weight: var(--text-2xs-weight);
    color: var(--text-secondary);
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border-strong);
  }

  tbody td {
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  .rownum {
    width: 2.5rem;
    text-align: right;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
    background: var(--bg-subtle);
    font-weight: var(--text-2xs-weight);
  }

  tbody .rownum {
    border-bottom: 1px solid var(--border);
  }

  .req {
    color: var(--danger-fg);
    margin-left: 2px;
  }

  td.invalid {
    background: var(--danger-subtle, rgba(220, 38, 38, 0.08));
    box-shadow: inset 2px 0 0 var(--danger-fg);
  }

  input[type='text'],
  input[type='url'],
  input[type='number'],
  input[type='date'],
  input[type='datetime-local'],
  select,
  textarea {
    width: 100%;
    min-width: 6rem;
    box-sizing: border-box;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font: inherit;
  }

  textarea {
    resize: vertical;
    line-height: 1.5;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-subtle);
  }

  .radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
  }

  .radio {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .plain {
    color: var(--text-primary);
  }

  .empty {
    padding: var(--space-6);
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--text-sm-size);
  }
</style>
