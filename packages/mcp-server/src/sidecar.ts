/**
 * サイドカー実行 — HTTP モードのサーバーと制御チャネルを繋ぐ配線。
 * -----------------------------------------------------------------------------
 * デスクトップアプリが子プロセスとして起動する形態のための組み立て役。
 *   - HTTP サーバーを listen し、確定した port / token / root を ready で親へ返す
 *   - ツール実行ごとの操作ログを 1 行ずつ親へ流す（UI の操作履歴になる）
 *   - 親からの set-root を受けて store の root を差し替える
 *
 * I/O は引数で受け取り、プロセスの stdin/stdout は参照しない。実プロセスへの結線は
 * 起動エントリ側の責務にして、ここは配線だけをテスト可能な形に保つ。
 */
import type { Readable } from 'node:stream';
import type { ToolLogEntry } from './toolLog.js';
import { FileDocumentStore } from './fileStore.js';
import { startHttpServer } from './httpServer.js';
import { encodeSidecarEvent, parseControlLine, splitControlLines } from './control.js';

/** サイドカーが使う入出力。実行時は process.stdin / process.stdout を渡す。 */
export interface SidecarIo {
  /** 制御コマンドが流れてくる読み取り側。 */
  input: Readable;
  /** 親へ 1 行（末尾改行込み）を書き出す。 */
  write: (line: string) => void;
}

export interface StartSidecarOptions {
  /** ワークスペース root。相対パスは絶対パスへ解決される。 */
  root: string;
  /** 起動ごとに発行する bearer トークン。 */
  token: string;
  /** listen ポート（既定 0 = OS 割当）。 */
  port?: number;
  io: SidecarIo;
  /** ログ時刻源（テスト用に注入可能）。 */
  now?: () => number;
}

export interface SidecarHandle {
  port: number;
  /** 希望したポートが使えず OS 割当へ切り替えたか（保存し直す判断に使う）。 */
  portChanged: boolean;
  /** クライアントが接続する完全な URL。 */
  url: string;
  /** 現在のワークスペース root（set-root で変わる）。 */
  root: () => string;
  /** 制御チャネルを外し、HTTP サーバーを閉じる。 */
  stop: () => Promise<void>;
}

/** HTTP サーバーを起動し、制御チャネルを結線して ready を通知する。 */
export async function startSidecar(options: StartSidecarOptions): Promise<SidecarHandle> {
  const { io, token, now } = options;
  const store = new FileDocumentStore(options.root);

  const base = {
    store,
    token,
    ...(now !== undefined ? { now } : {}),
    onLog: (entry: ToolLogEntry) => io.write(encodeSidecarEvent(entry)),
  };
  // 前回と同じポートを希望しても、別のアプリに取られていることはある。そのときは
  // 起動を諦めず OS 割当へ落とす（接続先が変わるだけで、機能は失われない）。
  const wanted = options.port ?? 0;
  let portChanged = false;
  let server;
  try {
    server = await startHttpServer({ ...base, port: wanted });
  } catch (error) {
    if (wanted === 0) throw error;
    server = await startHttpServer({ ...base, port: 0 });
    portChanged = true;
  }

  // チャンク境界は行境界と一致しないので、未完結分を持ち越しながら 1 行ずつ処理する。
  let pending = '';
  const onData = (chunk: Buffer | string): void => {
    const { lines, rest } = splitControlLines(pending + chunk.toString());
    pending = rest;
    for (const line of lines) handleLine(line);
  };

  function handleLine(line: string): void {
    const result = parseControlLine(line);
    if (result.kind === 'ignored') return;
    if (result.kind === 'error') {
      io.write(encodeSidecarEvent({ type: 'error', message: result.message }));
      return;
    }
    store.setRoot(result.command.root);
    io.write(encodeSidecarEvent({ type: 'root', root: store.getRoot() }));
  }

  io.input.on('data', onData);

  io.write(
    encodeSidecarEvent({
      type: 'ready',
      url: server.url,
      port: server.port,
      token,
      root: store.getRoot(),
    }),
  );

  return {
    port: server.port,
    portChanged,
    url: server.url,
    root: () => store.getRoot(),
    stop: async () => {
      io.input.off('data', onData);
      await server.close();
    },
  };
}
