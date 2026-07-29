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
  connectionHint,
  type McpLogEntry,
  type McpStatus,
} from './mcpLog';

/** 状態が届くまでの初期値。 */
function startingStatus(): McpStatus {
  return { state: 'starting', url: null, port: null, token: null, detail: null };
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

  /** 接続先 URL / 起動中 / 劣化理由の 1 行説明。 */
  get hint(): string {
    return connectionHint(this.status);
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
      this.status = { ...startingStatus(), state: 'unavailable' };
    }
    return () => {
      this.dispose();
    };
  }

  /** 購読を解除する。 */
  dispose(): void {
    for (const off of this.unlisten) off();
    this.unlisten = [];
  }
}

/** アプリ全体で 1 つの共有 MCP ストア。 */
export const mcp = new McpStore();
