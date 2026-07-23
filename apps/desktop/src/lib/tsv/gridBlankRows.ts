/**
 * 検証グリッドの「空パッド行」モデル（Issue 010・田中さん 2026-07-23
 * 「行の追加を押しても増えなかった」不具合）。
 * ------------------------------------------------------------------
 * カスタム TSV は **全セルが空の行** をテキストで表現できない。tsv 化すると
 * タブのみ行になり、パーサ（{@link ../../../../packages/schema-test-spec-tsv} の
 * `classifyLine`）が空行として読み飛ばすため、round-trip で消える。これは
 * Excel コピペの末尾空行を許容する意図的な契約なので、フォーマット側は変えない。
 *
 * 代わりに、スプレッドシート同様に「空行＝まだ値の入っていない入力用の足場」として
 * グリッド内のローカル状態（pad 行）で持つ。pad 行に値が入った時点で実データ行へ
 * 実体化し、全空行は畳む（＝データセル規約「未入力は空のまま」とも整合し、空行は
 * ファイルに焼かない）。ここでは実体化・空行判定・表示行数を DOM 非依存の純関数に
 * 切り出し、node 環境の vitest で検査する。Svelte 側は pad 数を持って描画する薄いグルー。
 */

/** 全セルが空文字（未入力）の行か。TSV round-trip で消える＝実データにできない行。 */
export function isBlankRow(cells: readonly string[]): boolean {
  return cells.every((cell) => cell === '');
}

/** 表示行数＝実データ行 + ローカル pad 空行（負の pad は 0 扱い）。 */
export function displayRowCount(dataRowCount: number, padRows: number): number {
  return dataRowCount + Math.max(0, padRows);
}

/** pad 行を含むセル編集の結果。 */
export interface PaddedEdit {
  /** onChange へ渡す実データ行（全空行を畳み済み）。 */
  rows: string[][];
  /** 表示行数を保つよう再計算した pad 行数。 */
  padRows: number;
}

/**
 * pad 行を含む表示グリッドの 1 セルを `value` に更新し、実体化した結果を返す。
 *
 * 表示行列（不足ぶんは空行）を作り `(row, col) = value` を書き込み、全空行を畳んで
 * 実データ行を確定する（パーサの空行スキップと同じ挙動＝round-trip で state が食い違わない）。
 * pad 行数は表示行数 `rows.length + padRows` を保つよう再計算するので、値の入った pad 行が
 * 実データへ繰り上がり、残りは pad のまま画面に残る。空文字を書いた場合は実体化されない。
 */
export function editPaddedCell(
  rows: readonly string[][],
  padRows: number,
  row: number,
  col: number,
  value: string,
): PaddedEdit {
  const total = displayRowCount(rows.length, padRows);
  const matrix: string[][] = [];
  for (let r = 0; r < total; r++) {
    matrix.push(rows[r] ? rows[r].slice() : []);
  }
  if (row >= 0 && row < total) {
    const target = matrix[row];
    while (target.length <= col) target.push('');
    target[col] = value;
  }
  const kept = matrix.filter((cells) => !isBlankRow(cells));
  return { rows: kept, padRows: Math.max(0, total - kept.length) };
}
