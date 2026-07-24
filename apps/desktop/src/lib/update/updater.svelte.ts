/**
 * 自動アップデートの共有コントローラ（副作用の器）。
 *
 * 実際の「更新確認 → ダウンロード → 適用 → 再起動」はプラグイン（updater / process）の
 * 副作用であり、UI から直接叩くと状態が散らばる。themeController / pdfExport と同じく
 * 本シングルトンに副作用を閉じ込め、UI へは畳み込んだ状態（UpdateState）と可視性だけを
 * 反応値として公開する。状態遷移そのものは純ロジック（updateFlow）へ委ね、ここは
 * プラグインのイベントを UpdateEvent へ写して dispatch するだけの薄いグルーに保つ。
 *
 * Tauri ランタイム外（素の vite）ではプラグイン呼び出しが例外になるため握りつぶす。
 * 手動確認では理由を提示し、起動時の自動確認では沈黙する（更新がある時だけ表に出す）。
 */
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { initialUpdateState, reduceUpdate, type UpdateState, type UpdateEvent } from './updateFlow';

class UpdaterController {
  /** UI が描画する更新フローの状態。 */
  state = $state<UpdateState>(initialUpdateState());
  /** ダイアログの可視性。手動確認は即表示、起動時自動確認は更新ありのときだけ表示する。 */
  visible = $state<boolean>(false);
  /** ダウンロード適用に使う Update ハンドル（check の結果を downloadAndInstall まで持ち越す）。 */
  #update: Update | null = null;

  #dispatch(event: UpdateEvent): void {
    this.state = reduceUpdate(this.state, event);
  }

  /** 手動「更新を確認」。確認中からダイアログを出し、経過（最新 / 更新あり / 失敗）を見せる。 */
  async check(): Promise<void> {
    this.visible = true;
    await this.#runCheck(true);
  }

  /** 起動時の自動確認。更新があるときだけダイアログを出し、最新 / 失敗時は沈黙する。 */
  async autoCheck(): Promise<void> {
    await this.#runCheck(false);
  }

  async #runCheck(manual: boolean): Promise<void> {
    this.#dispatch({ type: 'check-start' });
    try {
      const update = await check();
      this.#update = update;
      this.#dispatch({
        type: 'check-result',
        update: update ? { version: update.version, notes: update.body ?? '' } : null,
      });
      // 自動確認は更新ありのときだけ初めて可視化する。最新 / 失敗時は静かなまま。
      if (!manual && update) this.visible = true;
    } catch {
      // Tauri 外や通信失敗。手動時のみ理由を提示、自動時はダイアログを出さず idle へ戻す。
      if (manual) {
        this.#dispatch({
          type: 'error',
          message: '更新の確認に失敗しました。ネットワーク接続を確認してください。',
        });
      } else {
        this.#dispatch({ type: 'reset' });
      }
    }
  }

  /** 「今すぐ更新」。ダウンロード → 署名検証 → 適用まで進め、進捗を状態へ反映する。 */
  async downloadAndInstall(): Promise<void> {
    const update = this.#update;
    if (update === null) return;
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            this.#dispatch({
              type: 'download-start',
              contentLength: event.data.contentLength ?? 0,
            });
            break;
          case 'Progress':
            this.#dispatch({ type: 'download-progress', chunkLength: event.data.chunkLength });
            break;
          case 'Finished':
            this.#dispatch({ type: 'download-finished' });
            break;
        }
      });
      this.#dispatch({ type: 'installed' });
    } catch {
      this.#dispatch({ type: 'error', message: '更新の適用に失敗しました。' });
    }
  }

  /** 「再起動して更新を完了」。適用済みの新バージョンでアプリを再起動する。 */
  async relaunch(): Promise<void> {
    try {
      await relaunch();
    } catch {
      this.#dispatch({
        type: 'error',
        message: '再起動に失敗しました。アプリを手動で起動し直してください。',
      });
    }
  }

  /** ダイアログを閉じる（状態は idle へ戻す）。 */
  dismiss(): void {
    this.visible = false;
    this.#dispatch({ type: 'reset' });
  }
}

/** アプリ全体で 1 つの共有アップデートコントローラ。 */
export const updater = new UpdaterController();
