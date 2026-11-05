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
import { startHttpServer, type HttpServerHandle } from './httpServer.js';
import { pickStablePort } from './sidecarState.js';
import { createGitRunner, type GitExec } from './gitRunner.js';
import { createAppBridge } from './appBridge.js';
import { createDesktopOpener } from './desktopOpener.js';
import { encodeSidecarEvent, parseControlLine, splitControlLines } from './control.js';
import { createLogSink, nodeLogFs, type LogFs } from './logSink.js';

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
  /** `git` の実行部（テスト用に注入可能。既定は実際の子プロセス起動）。 */
  gitExec?: GitExec;
  /** 作業ログの置き場（テスト用に注入可能。既定は実際のファイル）。 */
  logFs?: LogFs;
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
  const { io, token, now, gitExec } = options;
  const store = new FileDocumentStore(options.root);
  // 画面操作の依頼は制御チャネルへ流し、親からの応答で解決する。
  const app = createAppBridge({ send: (event) => io.write(encodeSidecarEvent(event)) });
  const toFile = createLogSink({
    getRoot: () => store.getRoot(),
    fs: options.logFs ?? nodeLogFs(),
    warn: (message) => io.write(encodeSidecarEvent({ type: 'error', message })),
  });

  const base = {
    store,
    token,
    ...(now !== undefined ? { now } : {}),
    // root は set-root で切り替わるので、実行のたびに現在値を読み直す。
    git:
      gitExec === undefined
        ? createGitRunner(() => store.getRoot())
        : createGitRunner(() => store.getRoot(), gitExec),
    app,
    // アプリは動いているが、開いているフォルダが違うことがある。フォルダごと切り替える
    // 判断はアプリ側にあるので、動いていても同じ口を通す。
    desktop: createDesktopOpener({ getRoot: () => store.getRoot() }),
    // 画面へ流すのは今までどおり。残す側を足しただけで、閉じれば消える状態を無くす。
    onLog: (entry: ToolLogEntry) => {
      io.write(encodeSidecarEvent(entry));
      toFile(entry);
    },
  };
  const wanted = options.port ?? 0;
  const server = await listenOnStablePort((port) => startHttpServer({ ...base, port }), wanted);
  const portChanged = wanted !== 0 && server.port !== wanted;

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
    if (result.command.type === 'response') {
      app.settle(result.command);
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

/** 希望したポートを待つ回数と間隔。前回のサイドカーが閉じ終わる前に次が立つことがある。 */
const WANTED_PORT_ATTEMPTS = 4;
const WANTED_PORT_RETRY_MS = 250;
/** 範囲内から選び直す回数。尽きたら OS 割当へ落とす。 */
const STABLE_PORT_ATTEMPTS = 5;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 次回も同じ番号を取りやすいポートで待ち受ける。
 *
 * 1. 前回のポートを希望していれば、少し待ちながら取り直す（閉じかけの前回が持っていることがある）
 * 2. 取れなければ一時ポートの帯より下から選ぶ（OS 割当の番号は次回取れないことが多い）
 * 3. それも取れなければ OS 割当で立てる（接続先が変わるだけで、起動は諦めない）
 */
async function listenOnStablePort(
  listen: (port: number) => Promise<HttpServerHandle>,
  wanted: number,
): Promise<HttpServerHandle> {
  if (wanted !== 0) {
    for (let attempt = 0; attempt < WANTED_PORT_ATTEMPTS; attempt++) {
      if (attempt > 0) await delay(WANTED_PORT_RETRY_MS);
      try {
        return await listen(wanted);
      } catch {
        // 使用中。間を置いて取り直す。
      }
    }
  }
  for (let attempt = 0; attempt < STABLE_PORT_ATTEMPTS; attempt++) {
    try {
      return await listen(pickStablePort(Math.random));
    } catch {
      // 偶然使用中・予約済みの番号に当たった。別の番号を選ぶ。
    }
  }
  return listen(0);
}
