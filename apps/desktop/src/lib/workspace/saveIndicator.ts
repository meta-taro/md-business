/**
 * 保存状態の表示判断（純ロジック・DOM 非依存）。
 *
 * 自動保存は「押しても何も起きないボタン」に見えやすい。実際に効いているかは
 * 保存が起きたことが見えて初めて分かるので、状態そのものを画面に出すための判断を持つ。
 */

/** 画面に出す保存状態。文言は i18n 側で当てる。 */
export type SaveIndicator =
  | { kind: 'none' }
  | { kind: 'saving' }
  | { kind: 'dirty' }
  | { kind: 'saved'; time: string };

/** 判断材料。 */
export interface SaveStateInput {
  /** ファイルを開いているか。 */
  hasFile: boolean;
  /** 未保存の変更があるか。 */
  dirty: boolean;
  /** 書き込み中か。 */
  saving: boolean;
  /** 最後に保存できた時刻（未保存なら null）。 */
  savedAt: Date | null;
}

/** 時刻を `HH:MM` にする。日付は出さない（同じ日に何度も保存するため）。 */
export function formatClock(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * いま出すべき保存状態を決める。
 *
 * 優先順は 保存中 → 未保存 → 保存済み。書き込み中に「未保存」と出すと、
 * 押しても効いていないように見えるため保存中を先に出す。
 */
export function describeSaveState(input: SaveStateInput): SaveIndicator {
  if (!input.hasFile) return { kind: 'none' };
  if (input.saving) return { kind: 'saving' };
  if (input.dirty) return { kind: 'dirty' };
  if (input.savedAt === null) return { kind: 'none' };
  return { kind: 'saved', time: formatClock(input.savedAt) };
}
