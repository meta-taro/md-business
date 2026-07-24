// オートセーブの反応状態 + 副作用（localStorage 永続化 / デバウンス保存）。
// 判定は純ロジック autosave.ts に委譲し、ここは環境とつなぐ薄い層に留める。
import { AUTOSAVE_DELAY_MS, parseAutosaveEnabled, shouldAutosave } from './autosave';
import { workspace } from './workspace.svelte';

// 前回フォルダ等と同じ名前空間の保存キー。
const STORAGE_KEY = 'md-business:desktop:autosave';

// 既定オン。init() で保存値があれば上書きする。
let enabled = $state<boolean>(true);
let timer: ReturnType<typeof setTimeout> | null = null;

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // localStorage 不可（プライベート等）の環境では永続化を諦める。挙動は継続。
  }
}

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

export const autosave = {
  /** 現在の有効フラグ（テンプレートで参照するとラン依存で反応する）。 */
  get enabled(): boolean {
    return enabled;
  },

  /** 起動時に localStorage から有効フラグを確定する（未保存なら既定オン）。 */
  init(): void {
    enabled = parseAutosaveEnabled(readStored());
  },

  /** 有効フラグを設定し永続化する。無効化時は予約中の保存を取り消す。 */
  set(value: boolean): void {
    enabled = value;
    persist(value);
    if (!value) clearTimer();
  },

  /** トグル。 */
  toggle(): void {
    this.set(!enabled);
  },

  /**
   * 編集を受けてデバウンス保存を予約する。直前の予約は毎回引き直す（静止 = 最後の 1 回）。
   * 発火条件を満たさなければ何もしない。source 変化のたびに呼ぶ想定。
   */
  schedule(): void {
    clearTimer();
    const ready = shouldAutosave({
      enabled,
      hasFile: workspace.activePath !== null,
      dirty: workspace.dirty,
      saving: workspace.saving,
    });
    if (!ready) return;
    timer = setTimeout(() => {
      timer = null;
      // 予約後に状態が変わっている場合があるので保存側の canSave で最終ガード。
      if (workspace.canSave) void workspace.save();
    }, AUTOSAVE_DELAY_MS);
  },
};
