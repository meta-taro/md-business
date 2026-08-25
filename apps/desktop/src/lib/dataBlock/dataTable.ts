/**
 * 読み取った表を、本文へ置ける形にする。
 *
 * 出すものは 2 つ。1 つは Markdown の表で、読む人が目で追う側。画面・PDF・書き出しの
 * どれも同じ本文を通るので、どこで見ても同じ表になる。
 *
 * もう 1 つは中身をそのまま渡す囲み（`<script type="application/json">`）。組み上げた
 * ページの側から数字を引くための口で、**生の HTML を通す組み立てのときだけ**添える。
 * 通らない組み立てで添えても、本文の無害化で落ちるだけになる。
 *
 * 空欄は空欄のまま渡す。0 で埋めると「その日は 0 だった」と「その日は分からない」が
 * 同じ見た目になる。
 */
import type { DataTable } from '../chart/chartData';

/** 表のセルに置けない字を落とす。壊れた表は読める形をしているので気づかれにくい。 */
function toCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/[\r\n\t]+/g, ' ');
}

function row(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

export function toMarkdownTable(table: DataTable): string {
  const head = row(table.columns.map((name) => toCell(name)));
  const rule = row(table.columns.map(() => '---'));
  const body = table.rows.map((cells) => row(cells.map((cell) => toCell(cell))));
  return [head, rule, ...body].join('\n');
}

/** 属性の外へはみ出す字を逃がす。 */
function toAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** 中身に `</script>` と書かれていても囲みが閉じないように、`<` を逃がす。 */
function toJson(records: readonly Record<string, string | null>[]): string {
  return JSON.stringify(records).replace(/</g, '\\u003c');
}

export function toDataScript(table: DataTable, sourcePath: string): string {
  const records = table.rows.map((cells) => {
    const record: Record<string, string | null> = {};
    for (let index = 0; index < table.columns.length; index += 1) {
      const cell = cells[index];
      record[table.columns[index]] = cell === undefined || cell === '' ? null : cell;
    }
    return record;
  });
  const attribute = toAttribute(sourcePath);
  return `<script type="application/json" data-source="${attribute}">${toJson(records)}</script>`;
}
