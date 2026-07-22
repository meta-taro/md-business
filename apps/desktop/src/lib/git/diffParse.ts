/**
 * unified diff（`git diff` 出力）を描画用の行種別へ分類する純ロジック。
 *
 * Rust `git_diff` コマンドが返す生テキストを、そのまま色分け表示できる行配列へ落とす。
 * 描画（DiffView.svelte）はここが付けた `kind` に応じて背景色・記号色を割り当てるだけにし、
 * 分類ロジックはここで単体テストする（vitest は `.svelte` を評価できないため・§7.3 と同流儀）。
 */

/** diff 1 行の意味カテゴリ。色分けはこの kind へ写像する。 */
export type DiffLineKind = 'meta' | 'hunk' | 'add' | 'del' | 'context';

/** 描画用の 1 行。`text` は元の行そのまま（先頭の +/- 記号を含む）。 */
export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/** ファイルヘッダ・モード変更など、差分本体でない meta 行の接頭辞。 */
const META_PREFIXES = [
  'diff ',
  'index ',
  'new file',
  'deleted file',
  'old mode',
  'new mode',
  'rename ',
  'copy ',
  'similarity ',
  'dissimilarity ',
];

function classify(line: string): DiffLineKind {
  // ファイルヘッダ（--- / +++）は +/- 判定より先に meta へ倒す（追加・削除と混同しない）。
  if (line.startsWith('+++ ') || line.startsWith('--- ')) return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('\\')) return 'meta'; // "\ No newline at end of file"
  if (META_PREFIXES.some((p) => line.startsWith(p))) return 'meta';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  // 先頭スペースの文脈行・完全な空行・その他はすべて context 扱い。
  return 'context';
}

/**
 * 生の unified diff を行配列へ分類する。
 * 末尾の改行で生じる余分な空行は 1 つだけ取り除く（`+a\n+b\n` → 2 行）。
 * 空・空白のみの入力は空配列（呼び出し側で「差分なし」表示に分岐しやすくする）。
 */
export function parseUnifiedDiff(raw: string): DiffLine[] {
  if (raw.trim() === '') return [];
  const lines = raw.split('\n');
  // split の副産物（末尾改行由来の最終空要素）だけを 1 つ落とす。
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((text) => ({ kind: classify(text), text }));
}
