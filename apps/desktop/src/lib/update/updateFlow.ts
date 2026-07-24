/**
 * 自動アップデートの状態遷移とダウンロード進捗の純ロジック。
 *
 * 更新プラグインは「更新確認 → ダウンロード（進捗イベント連続）→ 適用 → 再起動」という
 * 一連の副作用を持つが、UI が描画するのはその途中経過を畳み込んだ状態だけである。
 * ここでは副作用（ネットワーク・鍵検証・再起動）を一切持たない純関数として状態機械を定義し、
 * 全分岐を単体テストで固定する。Svelte 側はこの状態を描画し、プラグインのイベントを
 * dispatch するだけの薄いグルーに保つ。
 */

/** 更新プラグインが確認結果として返す更新メタ情報（必要な項目のみ）。 */
export interface UpdateInfo {
  version: string;
  notes: string;
}

/** UI が描画する更新フローの状態。status で判別する直和型。 */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  | { status: 'available'; version: string; notes: string }
  | {
      status: 'downloading';
      version: string;
      downloaded: number;
      total: number;
      percent: number;
    }
  | { status: 'installing'; version: string }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

/** プラグインの副作用から生まれるイベント。reduceUpdate がこれを状態へ畳み込む。 */
export type UpdateEvent =
  | { type: 'check-start' }
  | { type: 'check-result'; update: UpdateInfo | null }
  | { type: 'download-start'; contentLength: number }
  | { type: 'download-progress'; chunkLength: number }
  | { type: 'download-finished' }
  | { type: 'installed' }
  | { type: 'error'; message: string }
  | { type: 'reset' };

/** 初期状態（何もしていない）。 */
export function initialUpdateState(): UpdateState {
  return { status: 'idle' };
}

/**
 * ダウンロード済みバイト数から進捗パーセント（0〜100 の整数）を求める。
 * 総バイト数が不明（0 以下）なら進捗を出しようがないため 0 を返す。
 * 端数は四捨五入し、範囲外は 0〜100 にクランプする。
 */
export function downloadPercent(downloaded: number, total: number): number {
  if (total <= 0) return 0;
  const pct = Math.round((downloaded / total) * 100);
  return Math.min(100, Math.max(0, pct));
}

/**
 * 現在状態とイベントから次状態を求める純関数。
 * 遷移対象外のイベント（例: downloading 以外での download-progress）は状態を変えず、
 * 同一参照をそのまま返す（無駄な再描画を避ける）。
 * error はどの状態からでも受け付け、reset で idle に戻す。
 */
export function reduceUpdate(state: UpdateState, event: UpdateEvent): UpdateState {
  switch (event.type) {
    case 'check-start':
      return { status: 'checking' };

    case 'check-result':
      return event.update === null
        ? { status: 'up-to-date' }
        : { status: 'available', version: event.update.version, notes: event.update.notes };

    case 'download-start': {
      // available からダウンロードへ。version を引き継ぐ（描画で更新先を示すため）。
      if (state.status !== 'available') return state;
      return {
        status: 'downloading',
        version: state.version,
        downloaded: 0,
        total: event.contentLength,
        percent: 0,
      };
    }

    case 'download-progress': {
      // 進捗はダウンロード中のみ意味を持つ。それ以外では無視する。
      if (state.status !== 'downloading') return state;
      const downloaded = state.downloaded + event.chunkLength;
      return {
        ...state,
        downloaded,
        percent: downloadPercent(downloaded, state.total),
      };
    }

    case 'download-finished':
      if (state.status !== 'downloading') return state;
      return { status: 'installing', version: state.version };

    case 'installed':
      if (state.status !== 'installing') return state;
      return { status: 'ready', version: state.version };

    case 'error':
      return { status: 'error', message: event.message };

    case 'reset':
      return { status: 'idle' };
  }
}
