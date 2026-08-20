/**
 * 「最後に開いたフォルダ」の復元ロジック（純粋部分）。
 *
 * 実際の保存 / 読込は WebView の localStorage（`workspace.svelte.ts` 側で browser ガード）
 * に閉じ、ここは localStorage の生値 → 復元候補パスへの変換だけを担う。DOM・Tauri・
 * localStorage に触れないため vitest で単体テストできる（railWidth / splitRatio と同方針）。
 */

/**
 * localStorage の生値から復元候補パスを導く。
 * 未保存（null）・空・空白のみは「復元しない」を意味する null を返す。
 */
export function parseStoredFolder(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 起動時に前回のフォルダを開くかどうか。
 *
 * `skip` は「前回の起動が、そのフォルダの読み込みを終える前に終わった」ことを指す。
 * 読み込みが返らない相手（応答しなくなった共有フォルダなど）を覚えていると、以後は
 * 起動するたび同じ場所で止まり、利用者は自力で抜け出せない。**一度でも終わらなかったら
 * 次は開かない**ことで、アプリ側から抜け道を残す。
 */
export type RestoreDecision =
  | { kind: 'restore'; path: string }
  | { kind: 'skip'; path: string }
  | { kind: 'none' };

/**
 * 記憶しているフォルダと、読み込み中に立てた印から、起動時の振る舞いを決める。
 *
 * 印が別のフォルダを指しているときは復元する。前に止まった相手とは違うので、
 * 今回まで巻き添えにする理由が無い。
 */
export function decideRestore(
  rawLast: string | null,
  rawAttempt: string | null,
): RestoreDecision {
  const last = parseStoredFolder(rawLast);
  if (last === null) return { kind: 'none' };
  const attempt = parseStoredFolder(rawAttempt);
  if (attempt === last) return { kind: 'skip', path: last };
  return { kind: 'restore', path: last };
}
