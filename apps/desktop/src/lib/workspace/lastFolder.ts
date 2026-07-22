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
