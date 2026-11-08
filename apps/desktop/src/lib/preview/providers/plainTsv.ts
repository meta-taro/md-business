/**
 * 宣言（`#!` 行）の無い `.tsv` の下見。
 *
 * 検証シートの書式を名乗っていないので、列の型も行 ID も無い。それでも Markdown として
 * 読ませると、タブがつぶれて 1 段落に流れ込み、列が読めなくなる。だから 1 行目を見出しに、
 * タブで区切っただけの表として描く。書き換えはしない（何の書式か分からないものを
 * 勝手に整えると、別の道具で読んだときに壊れる）。
 */
import { escapeHtml } from '@md-business/renderer-pdf';
import { buildPreviewDocument } from '../previewDocument';
import type { PreviewOk, PreviewStyle, RenderPreviewOptions } from '../previewFactory';

const STYLE_ID = 'plain-tsv';
const LABEL = 'TSV';

const CSS = `
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; font-size: 13px; color: #1f2937; background: #fff; }
  [data-theme="dark"] body { color: #e5e7eb; background: #1f2937; }
  .mdb-plain-tsv { border-collapse: collapse; }
  .mdb-plain-tsv th, .mdb-plain-tsv td { border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; vertical-align: top; white-space: pre-wrap; }
  .mdb-plain-tsv thead th { position: sticky; top: 0; background: #f1f5f9; font-weight: 600; }
  [data-theme="dark"] .mdb-plain-tsv th, [data-theme="dark"] .mdb-plain-tsv td { border-color: #475569; }
  [data-theme="dark"] .mdb-plain-tsv thead th { background: #334155; }
  .mdb-plain-tsv__empty { color: #64748b; }
`;

export const PLAIN_TSV_STYLE: PreviewStyle = { id: STYLE_ID, css: CSS };

/** ファイル名が `.tsv` か（大文字小文字を問わない）。 */
export function isTsvFileName(fileName: string | undefined): boolean {
  return fileName !== undefined && /\.tsv$/i.test(fileName);
}

export function renderPlainTsvPreview(
  source: string,
  options: RenderPreviewOptions = {},
): PreviewOk {
  const title = options.fileName?.split(/[\/]/).pop() ?? LABEL;
  return {
    ok: true,
    srcdoc: buildPreviewDocument({
      bodyHtml: buildTable(source),
      css: CSS,
      cssHref: options.cssHref?.(STYLE_ID),
      title,
      theme: options.theme,
      shortcuts: options.shortcuts,
    }),
    style: PLAIN_TSV_STYLE,
    documentTitle: title,
    label: LABEL,
    warnings: [],
    errors: [],
  };
}

function buildTable(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  // 末尾の改行で生まれる空行は行に数えない。途中の空行は表の 1 行として残す。
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return '<p class="mdb-plain-tsv__empty">中身がありません。</p>';

  const rows = lines.map((line) => line.split('\t'));
  const width = Math.max(...rows.map((cells) => cells.length));
  const fill = (cells: string[]): string[] => [...cells, ...Array<string>(width - cells.length).fill('')];
  const [head = [], ...body] = rows;

  const th = fill(head).map((cell) => `<th scope="col">${escapeHtml(cell)}</th>`).join('');
  const trs = body
    .map((cells) => `<tr>${fill(cells).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="mdb-plain-tsv"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}
