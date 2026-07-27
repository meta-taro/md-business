/**
 * 左レールのコンテキストメニュー純ロジック（DOM 非依存）。
 * 絶対 OS パスの組み立てと、ノード種別ごとの利用可能項目を決める。
 * 実際の副作用（reveal / クリップボード / フォージで開く）はコンポーネント側が持つ。
 */

/** コンテキストメニューの操作種別。 */
export type FileTreeMenuAction = 'reveal' | 'copyPath' | 'openForge';

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
 * ノード種別ごとの利用可能なメニュー項目。フォルダは reveal + パスのコピー。
 * ファイルは加えてフォージで開く（`/blob/` URL は個別ファイル向けのため）。
 * openForge の最終的な可否は forge_file_url の戻り（remote 無しなら null）で更に絞る。
 */
export function menuActionsForKind(kind: 'file' | 'folder'): FileTreeMenuAction[] {
  return kind === 'file' ? ['reveal', 'copyPath', 'openForge'] : ['reveal', 'copyPath'];
}
