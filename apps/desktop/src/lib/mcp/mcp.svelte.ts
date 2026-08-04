/**
 * 組み込み MCP サーバーの共有 rune ストア。
 *
 * SidePanel（MCP タブ）と StatusBar は別コンポーネントなので、両者の外側に本シングルトンを
 * 置く。invoke / listen の副作用はここに閉じ、判断・整形は mcpLog.ts の純関数へ委譲する。
 *
 * サーバーが起動しない環境（Node 未導入など）でも状態が `unavailable` になるだけで、
 * ほかの機能には一切影響しない。
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  appendLog,
  parseLogEvent,
  connectionText,
  type ConnectionText,
  type McpLogEntry,
  type McpStatus,
} from './mcpLog';

/** 状態が届くまでの初期値。 */
function startingStatus(): McpStatus {
  return { state: 'starting', url: null, port: null, token: null, reason: null, detail: null };
}

class McpStore {
  /** サイドカーの現在状態。 */
  status = $state<McpStatus>(startingStatus());

  /** 操作ログ（新しい順・上限あり）。 */
  logs = $state<McpLogEntry[]>([]);

  private unlisten: UnlistenFn[] = [];

  /** 接続可能か（タブの表示切替に使う）。 */
  get isReady(): boolean {
    return this.status.state === 'ready';
  }

  /** 接続先 URL / 起動中 / 劣化理由の 1 行説明（URL 以外は文言キー）。 */
  get connection(): ConnectionText {
    return connectionText(this.status);
  }

  /**
   * 起動時に 1 度だけ呼ぶ。現在状態を取り込み、以降の変化と操作ログを受け続ける。
   * 返り値で購読を解除する（画面が閉じるとき用）。
   */
  async init(): Promise<() => void> {
    // listen より先に取りに行くと、その間に来た状態変化を取り逃す。購読を先に張る。
    this.unlisten.push(
      await listen<McpStatus>('mcp-status', (event) => {
        this.status = event.payload;
      }),
      await listen<unknown>('mcp-log', (event) => {
        const entry = parseLogEvent(event.payload);
        if (entry !== null) this.logs = appendLog(this.logs, entry);
      }),
    );
    try {
      this.status = await invoke<McpStatus>('mcp_status');
    } catch {
      // 状態が取れないのは MCP が無い環境と同義。ほかの機能は動かし続ける。
      this.status = {
        ...startingStatus(),
        state: 'unavailable',
        reason: 'status-unreadable',
      };
    }
    return () => {
      this.dispose();
    };
  }

  /**
   * 開いているフォルダへ接続設定を書き出す。書き出したパスを返す。
   *
   * 手で貼らせると、貼り先も書式も分からないまま止まる。フォルダに置いてしまえば、
   * そこで動く AI クライアントが自分で読む。
   */
  async writeClientConfig(root: string): Promise<string> {
    return await invoke<string>('mcp_write_client_config', { root });
  }

  /**
   * 手で貼るための接続設定の全文。
   *
   * 組み立てはサーバー側と同じものを使う。画面側でも組むと、片方だけ直したときに
   * 写した設定が繋がらなくなる。
   */
  async clientConfig(): Promise<string> {
    return await invoke<string>('mcp_client_config');
  }

  /**
   * 起動をもう一度試す。Node を入れた直後に呼ばれる。
   *
   * アプリの起動し直しを挟ませない。入れた本人にとっては作業が終わった直後なので、
   * そこで一段挟むと「入れたのに直らない」に見える。
   *
   * やり直した結果は戻り値で受け取る。状態変化のイベントはこの応答と別経路で届くので、
   * 直後に `status` を読むと古い値のまま（繋がったのに失敗表示になる）。
   */
  async retry(): Promise<McpStatus> {
    return await invoke<McpStatus>('mcp_retry');
  }

  /** 購読を解除する。 */
  dispose(): void {
    for (const off of this.unlisten) off();
    this.unlisten = [];
  }
}

/** アプリ全体で 1 つの共有 MCP ストア。 */
export const mcp = new McpStore();
