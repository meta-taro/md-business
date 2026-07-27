/**
 * 「最近開いたフォルダ」の純ロジック。
 *
 * DB クライアントの接続先や git クライアントのリポジトリ一覧と同じで、作業フォルダは
 * 数個を行き来するのが実態なので、毎回ダイアログで辿らせず一覧から選べるようにする。
 * 実際の保存 / 読込は WebView の localStorage（`workspace.svelte.ts` 側で browser ガード）
 * に閉じ、ここは生値 ⇄ パス配列の変換と並べ替えだけを担う（lastFolder と同方針）。
 *
 * 保持順は「最近開いた順」。消えたフォルダを弾くのは存在確認の役目で、ここではしない
 * （オフラインの共有ドライブ等、一時的に見えないだけのものを勝手に忘れないため）。
 */

/** 保持する最大件数。増やしすぎると一覧が選びにくくなるので実用域で止める。 */
export const RECENT_FOLDERS_MAX = 10;

/** 表示用に分解したフォルダ名。`parent` は親が無い場合（ドライブ直下等）は空文字。 */
export interface FolderLabel {
  name: string;
  parent: string;
}

/** 空白のみを捨てつつ順序を保って重複を畳む（先勝ち）。 */
function normalizeList(paths: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const trimmed = path.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.slice(0, RECENT_FOLDERS_MAX);
}

/**
 * localStorage の生値からパス配列を復元する。
 * 壊れた値（旧形式・手編集・別アプリの衝突）は履歴を捨てるだけで、起動は止めない。
 */
export function parseRecentFolders(raw: string | null): string[] {
  if (raw === null || raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return normalizeList(parsed.filter((v): v is string => typeof v === 'string'));
}

/** localStorage へ保存する形へ直す。 */
export function serializeRecentFolders(paths: readonly string[]): string {
  return JSON.stringify(normalizeList(paths));
}

/** `path` を最近開いた順の先頭へ置く（既にあれば移動・上限超過は末尾から落ちる）。 */
export function addRecentFolder(paths: readonly string[], path: string): string[] {
  const trimmed = path.trim();
  if (trimmed === '') return normalizeList(paths);
  return normalizeList([trimmed, ...paths]);
}

/** `path` を履歴から取り除く（一覧の × 印）。 */
export function removeRecentFolder(paths: readonly string[], path: string): string[] {
  return normalizeList(paths.filter((p) => p !== path));
}

/**
 * 保存済みの履歴を復元する。
 *
 * 履歴を持たない版から更新した場合、履歴は空でも「最後に開いたフォルダ」は残っている。
 * その 1 件を初回の履歴として引き継ぎ、更新直後の一覧が空で始まらないようにする。
 */
export function restoreRecentFolders(rawRecent: string | null, lastFolder: string | null): string[] {
  const recent = parseRecentFolders(rawRecent);
  if (recent.length > 0) return recent;
  return lastFolder === null ? [] : addRecentFolder([], lastFolder);
}

/**
 * 表示用にフォルダ名と親パスへ分ける。一覧では末尾のフォルダ名だけが手掛かりになるが、
 * 同名フォルダ（`docs` が複数）を見分けるには親も要るため、2 段で見せられる形にする。
 * 区切りは Windows / POSIX の両方を受ける（保存値は OS が返したパスそのまま）。
 */
export function folderLabel(path: string): FolderLabel {
  const trimmed = path.trim();
  // 末尾の区切りは名前の一部ではない。ただし全部が区切り（"/" や "C:\"）なら残す。
  const body = trimmed.replace(/[\\/]+$/, '');
  // ルート自身（"/" や "C:\"）は区切りごと見せる。"C:" だけだと打ち損じに見える。
  if (body === '' || /^[A-Za-z]:$/.test(body)) return { name: trimmed, parent: '' };
  const cut = Math.max(body.lastIndexOf('\\'), body.lastIndexOf('/'));
  if (cut < 0) return { name: body, parent: '' };
  return { name: body.slice(cut + 1), parent: body.slice(0, cut) };
}
