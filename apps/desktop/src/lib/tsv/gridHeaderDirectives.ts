/**
 * 検証グリッドの表ヘッダ拡張ディレクティブ（Issue 010・田中さん 2026-07-23
 * 「表の上に補足」「ヘッダを肉厚に（大分類→項目/手順/結果）」）。
 * ------------------------------------------------------------------
 * 型付きヘッダ（列定義）とは別レイヤーの表示行を `#@` ディレクティブへ載せる。
 * - `#@ note <text>` … 表の上の補足行（全幅・複数可・記載順）。
 * - `#@ group <start>[-<end>] <label>` … 列をまたぐ肉厚グループヘッダ（複数可・Block TSV-X）。
 * 既存の共有パーサ（`schema-test-spec-tsv`）は `#@` 行を `doc.directives` に生文字列として
 * round-trip するため、フォーマット契約を変えずに表構造を tsv へ焼ける（`gridLayoutDirectives`
 * と同じ仕組み・§16 追加ディレクティブ）。純ロジックのみで、描画は Svelte 側の薄いグルー。
 */

const NOTE = 'note';
const GROUP = 'group';

/** 対象ディレクティブなら本体（種別語を除いた残り）を返す。違えば null。 */
function bodyOf(directive: string, kind: string): string | null {
  if (directive === kind) return '';
  if (directive.startsWith(`${kind} `)) return directive.slice(kind.length + 1).trim();
  return null;
}

/** 列をまたぐグループヘッダの生範囲（0 始まり・end は包含）。 */
export interface GroupRange {
  start: number;
  end: number;
  label: string;
}

/** グループヘッダ行の描画セル（隙間は空ラベルで全列を覆う）。 */
export interface GroupSegment {
  label: string;
  start: number;
  span: number;
}

/** 表の上の補足行（`#@ note <text>`）を記載順に返す。空文字の note 行は無視。 */
export function readNotes(directives: readonly string[]): string[] {
  const notes: string[] = [];
  for (const directive of directives) {
    const body = bodyOf(directive, NOTE);
    if (body !== null && body !== '') notes.push(body);
  }
  return notes;
}

/**
 * 補足行を `#@ note` ディレクティブへ書き戻す。note 以外は元の順で温存し、note 行は
 * まとめて末尾へ付け直す（空文字は出力しない）。読み書きは round-trip する。
 */
export function writeNotes(directives: readonly string[], notes: readonly string[]): string[] {
  const kept = directives.filter((d) => bodyOf(d, NOTE) === null);
  const lines = notes.filter((n) => n !== '').map((n) => `${NOTE} ${n}`);
  return [...kept, ...lines];
}

/**
 * 補足行の 1 件編集を notes 配列へ適用する（Svelte 側のインライン編集用・純ロジック）。
 * - `index < length`: 既存を差し替え。前後空白を落とし、空になったら削除。
 * - `index === length`: 新規追加（空なら何もしない）。
 * - それ以外（範囲外）: 変更せずコピーを返す。
 * 元配列は変更しない（常に新配列）。
 */
export function applyNoteEdit(notes: readonly string[], index: number, text: string): string[] {
  const next = notes.slice();
  const trimmed = text.trim();
  if (index >= 0 && index < next.length) {
    if (trimmed === '') next.splice(index, 1);
    else next[index] = trimmed;
  } else if (index === next.length && trimmed !== '') {
    next.push(trimmed);
  }
  return next;
}

/** 補足行を 1 件削除する（範囲外は変更せずコピー）。元配列は変更しない。 */
export function removeNoteAt(notes: readonly string[], index: number): string[] {
  const next = notes.slice();
  if (index >= 0 && index < next.length) next.splice(index, 1);
  return next;
}

/** `<start>[-<end>] <label>` をパースする。範囲不正・ラベル無しは null。 */
function parseGroup(body: string): GroupRange | null {
  const m = body.match(/^(\d+)(?:-(\d+))?\s+(.+)$/);
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[2] !== undefined ? Number(m[2]) : start;
  const label = m[3].trim();
  if (label === '' || end < start) return null;
  return { start, end, label };
}

/** 肉厚グループヘッダ（`#@ group <start>[-<end>] <label>`）を記載順に返す。不正は捨てる。 */
export function readGroups(directives: readonly string[]): GroupRange[] {
  const groups: GroupRange[] = [];
  for (const directive of directives) {
    const body = bodyOf(directive, GROUP);
    if (body === null) continue;
    const parsed = parseGroup(body);
    if (parsed) groups.push(parsed);
  }
  return groups;
}

/**
 * グループ範囲を「全列を覆う描画セル」へ解決する。start 昇順に並べ、範囲は列数でクランプ、
 * 重なりは先勝ちで後をスキップ、隙間は空ラベルのセルで埋める。妥当なグループが無ければ
 * 空配列（＝グループ行を描かない）。
 */
export function groupCells(groups: readonly GroupRange[], colCount: number): GroupSegment[] {
  if (colCount <= 0) return [];
  const sorted = groups
    .filter((g) => g.start >= 0 && g.start < colCount && g.end >= g.start)
    .map((g) => ({ start: g.start, end: Math.min(g.end, colCount - 1), label: g.label }))
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return [];

  const cells: GroupSegment[] = [];
  let col = 0;
  for (const g of sorted) {
    if (g.start < col) continue; // 既に埋めた列に重なる → 先勝ちでスキップ
    if (g.start > col) cells.push({ label: '', start: col, span: g.start - col });
    cells.push({ label: g.label, start: g.start, span: g.end - g.start + 1 });
    col = g.end + 1;
  }
  if (col < colCount) cells.push({ label: '', start: col, span: colCount - col });
  return cells;
}

/**
 * グループヘッダを `#@ group` ディレクティブへ書き戻す。group 以外は元の順で温存し、
 * group 行はまとめて末尾へ付け直す。単一列は `<start>`、範囲は `<start>-<end>`。round-trip する。
 */
export function writeGroups(
  directives: readonly string[],
  groups: readonly GroupRange[],
): string[] {
  const kept = directives.filter((d) => bodyOf(d, GROUP) === null);
  const lines = groups.map((g) => {
    const range = g.end > g.start ? `${g.start}-${g.end}` : `${g.start}`;
    return `${GROUP} ${range} ${g.label}`;
  });
  return [...kept, ...lines];
}
