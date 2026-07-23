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

/** 対象ディレクティブなら本体（種別語を除いた残り）を返す。違えば null。 */
function bodyOf(directive: string, kind: string): string | null {
  if (directive === kind) return '';
  if (directive.startsWith(`${kind} `)) return directive.slice(kind.length + 1).trim();
  return null;
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
