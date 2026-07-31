/**
 * アプリ画面への依頼ブリッジ。
 * -----------------------------------------------------------------------------
 * PDF 出力のように「表示中のプレビューを印刷する」操作は、画面を持つアプリ側でしか
 * 実行できない。ここは制御チャネル越しの依頼を 1 往復の Promise に見せる層で、
 * 送信そのものは呼び出し側（サイドカー）が渡す `send` に委ねる。
 *
 * 応答が返らない可能性は常にある（アプリが落ちた・画面が固まった）。待ち続けると
 * ツールが返らなくなるので、必ず時間切れで打ち切る。
 */
import type { RequestEvent, ResponseCommand } from './control.js';

/** アプリへ頼む操作。 */
export interface AppRequest {
  action: 'export-pdf';
  /** 対象のワークスペース相対パス。 */
  path: string;
}

/** 依頼の結果。失敗理由はそのまま利用者へ見せられる日本語で返す。 */
export type AppRequestResult = { ok: true } | { ok: false; error: string };

export interface AppBridge {
  /** アプリへ依頼を出し、応答（または時間切れ）まで待つ。 */
  request(req: AppRequest): Promise<AppRequestResult>;
  /** 制御チャネルで受け取った応答を、対応する依頼へ渡す。 */
  settle(response: ResponseCommand): void;
}

export interface CreateAppBridgeOptions {
  /** 依頼イベントを親プロセスへ送る。 */
  send: (event: RequestEvent) => void;
  /** 応答を待つ上限（既定 20 秒）。 */
  timeoutMs?: number;
}

/** 応答が無いまま待ち続けない上限。画面を開く程度の操作なので長くは要らない。 */
const DEFAULT_TIMEOUT_MS = 20_000;

export function createAppBridge(options: CreateAppBridgeOptions): AppBridge {
  const { send, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const pending = new Map<string, (result: AppRequestResult) => void>();
  let seq = 0;

  return {
    request(req: AppRequest): Promise<AppRequestResult> {
      seq += 1;
      const id = `req-${seq}`;
      return new Promise<AppRequestResult>((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ ok: false, error: 'アプリから応答がありません（画面が開いているか確認してください）' });
        }, timeoutMs);
        // タイマーがイベントループを引き止めると、サーバーが終了できなくなる。
        timer.unref?.();

        pending.set(id, (result) => {
          clearTimeout(timer);
          resolve(result);
        });
        send({ type: 'request', id, action: req.action, path: req.path });
      });
    },

    settle(response: ResponseCommand): void {
      // 時間切れ後に届いた応答・知らない id は、対応する待ち手がいないので捨てる。
      const resolve = pending.get(response.id);
      if (resolve === undefined) return;
      pending.delete(response.id);
      if (response.ok) {
        resolve({ ok: true });
        return;
      }
      resolve({ ok: false, error: response.error ?? 'アプリ側で処理できませんでした' });
    },
  };
}
