/**
 * オートセーブの純ロジック（DOM・Tauri 非依存）。
 * 反応状態と localStorage / タイマーの副作用は autosave.svelte.ts が担い、
 * ここは「保存の可否判定」と「保存済み設定値の解釈」だけを持つ。
 */

/** 最後の編集から静止したとみなすまでの待ち時間（ミリ秒）。 */
export const AUTOSAVE_DELAY_MS = 1200;

/**
 * localStorage の生値 → オートセーブ有効フラグ。既定はオン。
 * 明示的に無効化したときだけ 'false' が入るので、それ以外（未保存・未知値）はオンへ寄せる。
 */
export function parseAutosaveEnabled(raw: string | null): boolean {
  return raw !== 'false';
}

/** オートセーブの発火条件。手動保存の canSave（ファイルあり・差分あり・非保存中）と揃える。 */
export interface AutosaveState {
  /** 設定でオートセーブが有効か。 */
  enabled: boolean;
  /** ファイルを開いているか。 */
  hasFile: boolean;
  /** 未保存差分があるか。 */
  dirty: boolean;
  /** 保存処理中か。 */
  saving: boolean;
}

/** 今オートセーブすべきか。すべての条件を満たすときだけ true。 */
export function shouldAutosave(state: AutosaveState): boolean {
  return state.enabled && state.hasFile && state.dirty && !state.saving;
}
