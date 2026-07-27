/**
 * 「フォルダごとのツリー表示状態」の純ロジック。
 *
 * 作業フォルダは数個を行き来するのが実態（recentFolders と同じ前提）で、戻ってくるたびに
 * 第 1 階層まで畳まれて開いていたファイルも閉じていると、毎回同じ手順で辿り直すことになる。
 * どこを開いていたかをフォルダ単位で覚えておき、次に開いたときへ引き継ぐ。
 *
 * 実際の保存 / 読込は WebView の localStorage（`workspace.svelte.ts` 側で browser ガード）
 * に閉じ、ここは生値 ⇄ 状態配列の変換と並べ替えだけを担う（lastFolder / recentFolders と同方針）。
 */

/** フォルダ 1 つ分の表示状態。パスは走査と同じ "/" 区切りの相対パス。 */
export interface TreeViewState {
  /** 対象フォルダの絶対パス。 */
  root: string;
  /** 展開していたフォルダの相対パス。 */
  expanded: string[];
  /** 開いていたファイルの相対パス（未オープンは null）。 */
  active: string | null;
}

/** 覚えておくフォルダ数。履歴（recentFolders）と同じ実用域で止める。 */
export const TREE_STATES_MAX = 10;

/** 保存値の 1 要素を検証して取り込む（型が違うものは黙って落とす）。 */
function parseOne(value: unknown): TreeViewState | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const root = typeof record['root'] === 'string' ? record['root'].trim() : '';
  if (root === '') return null;
  const expanded = Array.isArray(record['expanded'])
    ? record['expanded'].filter((v): v is string => typeof v === 'string')
    : [];
  const active = typeof record['active'] === 'string' ? record['active'] : null;
  return { root, expanded, active };
}

/** root の重複を畳み（先勝ち）、上限で切る。 */
function normalize(states: readonly TreeViewState[]): TreeViewState[] {
  const out: TreeViewState[] = [];
  const seen = new Set<string>();
  for (const s of states) {
    if (seen.has(s.root)) continue;
    seen.add(s.root);
    out.push(s);
  }
  return out.slice(0, TREE_STATES_MAX);
}

/**
 * localStorage の生値から状態配列を復元する。
 * 壊れた値（旧形式・手編集）は記憶を捨てるだけで、起動は止めない。
 */
export function parseTreeStates(raw: string | null): TreeViewState[] {
  if (raw === null || raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return normalize(parsed.map(parseOne).filter((s): s is TreeViewState => s !== null));
}

/** localStorage へ保存する形へ直す。 */
export function serializeTreeStates(states: readonly TreeViewState[]): string {
  return JSON.stringify(normalize(states));
}

/** `next` を先頭に置き直す（同じ root の古い記憶は差し替え・上限超過は末尾から落ちる）。 */
export function rememberTreeState(
  states: readonly TreeViewState[],
  next: TreeViewState,
): TreeViewState[] {
  return normalize([next, ...states]);
}

/** `root` の記憶を捨てる（履歴から消したフォルダの分）。 */
export function forgetTreeState(states: readonly TreeViewState[], root: string): TreeViewState[] {
  return states.filter((s) => s.root !== root);
}

/** `root` の記憶を引く。無ければ null（＝初めて開くフォルダ）。 */
export function pickTreeState(
  states: readonly TreeViewState[],
  root: string,
): TreeViewState | null {
  return states.find((s) => s.root === root) ?? null;
}

/**
 * 展開状態を復元する。
 *
 * 記憶が無い（初めて開く）ときだけ既定の展開に倒し、記憶があるならそれを尊重する。
 * 全部畳んだ状態も操作の結果なので、空の記憶を既定へ戻さない。前回から消えたフォルダは
 * 落とす（残しても開けず、次の保存で溜まり続けるだけ）。
 */
export function restoreExpanded(
  remembered: readonly string[] | null,
  folderPaths: readonly string[],
  fallback: readonly string[],
): string[] {
  if (remembered === null) return [...fallback];
  const exists = new Set(folderPaths);
  return remembered.filter((path) => exists.has(path));
}

/**
 * 記憶から実際に何か戻せたかを判定する（復元したことを画面で知らせるかの判断）。
 *
 * 黙って戻すと、覚えていること自体に気付けない（勝手に開いたように見える）。
 * 一方で、記憶が残っていても対象が全部消えていれば何も戻っていないので、
 * そのときに「前回の続き」と言うと嘘になる。戻ったものがある時だけ知らせる。
 */
export function hasRestoredView(
  remembered: TreeViewState | null,
  expanded: readonly string[],
  active: string | null,
): boolean {
  if (remembered === null) return false;
  return active !== null || expanded.length > 0;
}

/** 相対パスから表示用のファイル名を取り出す（走査と同じ "/" 区切り）。 */
export function fileLabel(relPath: string): string {
  const cut = relPath.lastIndexOf('/');
  return cut < 0 ? relPath : relPath.slice(cut + 1);
}
