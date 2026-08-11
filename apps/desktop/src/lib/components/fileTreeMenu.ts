/**
 * 左レールのコンテキストメニュー純ロジック（DOM 非依存）。
 * 絶対 OS パスの組み立て、ノード種別ごとの利用可能項目、改名時の名前チェックを決める。
 * 実際の副作用（reveal / クリップボード / フォージで開く / 改名）はコンポーネント側が持つ。
 */

/** コンテキストメニューの操作種別。 */
export type FileTreeMenuAction =
  | 'newTestSheet'
  | 'rename'
  | 'reveal'
  | 'copyName'
  | 'copyRelPath'
  | 'copyPath'
  | 'openForge'
  | 'fileInfo';

/**
 * ノードの絶対 OS パス。root の区切り文字（バックスラッシュを含めば Windows・他は "/"）へ
 * relPath を寄せて連結する。relPath は scan と同じく "/" 区切りだが、両区切り・先頭区切り・
 * 重複区切りを畳んでから連結する。revealItemInDir とパスのコピーで使う。
 */
export function toAbsolutePath(root: string, relPath: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  const base = root.replace(/[\\/]+$/, '');
  const segments = relPath.split(/[\\/]+/).filter((s) => s !== '');
  return segments.length === 0 ? base : `${base}${sep}${segments.join(sep)}`;
}

/**
 * ノード種別ごとの利用可能なメニュー項目。フォルダは検証シートの新規作成・名前の変更・
 * reveal・各種コピー。ファイルは新規作成の代わりにフォージで開く（`/blob/` URL は個別
 * ファイル向けのため）。openForge の最終的な可否は forge_file_url の戻り（remote 無しなら
 * null）で更に絞る。
 */
export function menuActionsForKind(kind: 'file' | 'folder'): FileTreeMenuAction[] {
  const common: FileTreeMenuAction[] = ['rename', 'reveal', 'copyName', 'copyRelPath', 'copyPath'];
  // 新規作成は「どこに作るか」をフォルダで指す操作なので、フォルダにだけ出す。
  // ファイル情報は 1 本のファイルを読んで測る値なので、逆にファイルにだけ出す。
  return kind === 'file' ? [...common, 'openForge', 'fileInfo'] : ['newTestSheet', ...common];
}

/** 相対パスの末尾の名前（改名の初期値・ファイル名のコピーで使う）。 */
export function baseName(relPath: string): string {
  const segments = relPath.split(/[\\/]+/).filter((s) => s !== '');
  return segments.length === 0 ? '' : segments[segments.length - 1];
}

/** 新しい名前が使えない理由。文言は i18n 側で当てる。 */
export type NewNameError = 'empty' | 'separator' | 'invalidChar' | 'extension';

/** ツリーに出せる拡張子。改名で外れると走査対象から消え、行方不明になる。 */
const ALLOWED_EXT = /\.(md|tsv)$/i;

/** OS が受け付けない記号。他 OS では通るものもあるが、可搬性のため一律で止める。 */
const INVALID_NAME_SYMBOLS = /[:*?"<>|]/;

/** 制御文字（貼り付けで紛れ込むことがある）。見えないので名前に入ると原因が分からなくなる。 */
function hasControlChar(name: string): boolean {
  for (const ch of name) {
    if ((ch.codePointAt(0) ?? 0) < 0x20) return true;
  }
  return false;
}

/**
 * 改名で入力された名前を、書き込む前にその場で判定する。
 *
 * 同じ判定は Rust 側でも行う（そちらが最終ゲート）。ここは入力中に理由を見せるためのもので、
 * 「押したら OS のエラーが返ってきた」を避ける。移動には使わせないので区切り文字は拒否する。
 */
export function validateNewName(name: string, kind: 'file' | 'folder'): NewNameError | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  if (/[\\/]/.test(trimmed) || trimmed === '.' || trimmed === '..') return 'separator';
  if (INVALID_NAME_SYMBOLS.test(trimmed) || hasControlChar(trimmed)) return 'invalidChar';
  if (kind === 'file' && !ALLOWED_EXT.test(trimmed)) return 'extension';
  return null;
}

/**
 * フォルダの下に置くファイルの相対パス。区切りは走査と同じ "/" に揃え、
 * ルート直下（親が空）では先頭に区切りを付けない。
 */
export function childPath(parentRelPath: string, name: string): string {
  const segments = parentRelPath.split(/[\\/]+/).filter((s) => s !== '');
  return [...segments, name.trim()].join('/');
}

/** 改名後の相対パス（末尾の名前だけ差し替える）。 */
export function renamedPath(relPath: string, newName: string): string {
  const segments = relPath.split(/[\\/]+/).filter((s) => s !== '');
  return [...segments.slice(0, -1), newName.trim()].join('/');
}
