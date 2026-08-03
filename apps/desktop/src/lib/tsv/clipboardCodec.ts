/**
 * クリップボード TSV の符号化 / 復号。
 * ------------------------------------------------------------------
 * セルの中の改行・タブを、行区切り・列区切りと区別できるようにする。素朴に tab と
 * 改行で連結すると、複数行のセル 1 個が貼り付け先で 2 行に割れ、以降の列がずれる。
 * 検証シートは手順・確認内容を箇条書きで書くため、複数行のセルが常態的に存在する。
 *
 * 方式は Excel / Google Sheets と同じ引用符方式（RFC 4180 を TSV に当てたもの）:
 * 区切り・改行・引用符を含むセルだけを `"` で囲み、中の `"` は `""` へ倍にする。
 * 囲む必要が無いセルはそのまま出すので、ふつうの表の見た目と互換性は変わらない。
 *
 * ファイル正本のエスケープ（`\n` などのバックスラッシュ方式）とは別物。正本の符号化は
 * schema-test-spec-tsv が持ち、ここは外部アプリとの受け渡しだけを担う。グリッドが持つ
 * セル値は復号済み（実際の改行）なので、この層は生の文字列だけを見ればよい。
 */

/** 囲みが要るのは、囲まないと構造と区別できなくなる文字を含むときだけ。 */
const NEEDS_QUOTING = /["\t\r\n]/;

/** セル 1 個をクリップボード表現へ。必要なときだけ `"` で囲む。 */
export function encodeClipboardCell(value: string): string {
  if (!NEEDS_QUOTING.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

/** 矩形をクリップボード文字列へ。行は改行、列はタブで連結する。 */
export function serializeClipboardMatrix(matrix: readonly (readonly string[])[]): string {
  return matrix.map((cells) => cells.map(encodeClipboardCell).join('\t')).join('\n');
}

/**
 * クリップボード文字列を矩形へ。空文字は空配列。
 *
 * 囲みとみなすのは **セルの先頭にある** `"` だけ。途中の `"`（`15"モニタ` など）は
 * ただの文字として残す。Excel も同じ判定で、これを外すと引用符を含む素のテキストが壊れる。
 */
export function parseClipboardMatrix(text: string): string[][] {
  if (text === '') return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let atCellStart = true;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        // `""` は引用符 1 個。単独の `"` は囲みの終わり。
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
        continue;
      }
      cell += ch;
      continue;
    }

    if (atCellStart && ch === '"') {
      quoted = true;
      atCellStart = false;
      continue;
    }
    atCellStart = false;

    if (ch === '\t') {
      row.push(cell);
      cell = '';
      atCellStart = true;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atCellStart = true;
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  rows.push(row);

  // Excel / Sheets は末尾に改行を付ける。それが作った空行 1 個だけ捨てる。
  const last = rows[rows.length - 1];
  if (rows.length > 1 && last.length === 1 && last[0] === '') rows.pop();

  return rows;
}
