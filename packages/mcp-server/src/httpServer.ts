/**
 * MCP サーバーの HTTP モード（組み込みアプリからの spawn 用）。
 * -----------------------------------------------------------------------------
 * デスクトップアプリが子プロセスとして起動し、ローカルの AI クライアントが
 * `http://127.0.0.1:<port>/mcp` + bearer トークンで接続する。多重防御：
 *   1. 127.0.0.1 のみに bind（外部ホストは到達不可）
 *   2. トランスポート内蔵の DNS リバインディング保護（allowedHosts）
 *   3. 起動ごとランダム bearer トークンの照合（httpAuth）
 * ステートレス + JSON 応答モードで動かし、リクエストごとに server/transport を
 * 使い捨てる（セッション/SSE のライフサイクル管理を持たない単純経路）。
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { DocumentStore } from './store.js';
import { createServer, type CreateServerOptions } from './server.js';
import type { GitRunner } from './gitTools.js';
import type { ToolLogEntry } from './toolLog.js';
import { isAuthorized } from './httpAuth.js';

/** 既定の bind ホスト（ループバック固定）。 */
const LOOPBACK = '127.0.0.1';
/** MCP エンドポイントのパス。 */
const MCP_PATH = '/mcp';

/** startHttpServer の設定。 */
export interface StartHttpServerOptions {
  /** ツールが操作するワークスペース（root 差し替えは呼び出し側が同一インスタンスへ行う）。 */
  store: DocumentStore;
  /** 起動ごとに発行するランダム bearer トークン（空文字は拒否）。 */
  token: string;
  /** bind ホスト（既定 127.0.0.1）。ループバック以外は想定しない。 */
  host?: string;
  /** listen ポート（既定 0 = OS 割当）。 */
  port?: number;
  /** ツール実行 1 件ごとのログ（stdout への 1 行出力や UI 転送に使う）。 */
  onLog?: (entry: ToolLogEntry) => void;
  /** ログ時刻源（テスト用に注入可能）。 */
  now?: () => number;
  /** `git` 実行器。渡したときだけ git ツールを公開する。 */
  git?: GitRunner;
}

/** 起動済み HTTP サーバーのハンドル。 */
export interface HttpServerHandle {
  /** 実際に割り当たったポート。 */
  port: number;
  /** bind ホスト。 */
  host: string;
  /** クライアントが接続する完全な URL。 */
  url: string;
  /** サーバーを閉じる。 */
  close(): Promise<void>;
}

/** JSON 本文で HTTP エラーを返す（MCP プロトコルに乗らない前段の拒否）。 */
function respondError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

/**
 * HTTP モードの MCP サーバーを起動する。listen 完了後にポートを確定して返す。
 * spawn 側（Rust / bin）はこの port と token を AI クライアントへ渡す。
 */
export async function startHttpServer(options: StartHttpServerOptions): Promise<HttpServerHandle> {
  const { store, token, onLog, now, git } = options;
  const host = options.host ?? LOOPBACK;

  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // パス以外（/ や /favicon.ico 等）は 404。クエリは無視してパスだけ見る。
    const path = (req.url ?? '').split('?')[0];
    if (path !== MCP_PATH) {
      respondError(res, 404, 'not found');
      return;
    }
    // bearer トークン照合（loopback bind と DNS 保護に加えた最後の関門）。
    if (!isAuthorized(req.headers.authorization, token)) {
      respondError(res, 401, 'unauthorized');
      return;
    }
    // ステートレス JSON モード：リクエストごとに server/transport を作って使い捨てる。
    // allowedHosts は listen 済みポートから確定した loopback:port のみ許可する。
    const boundPort = currentPort();
    // sessionIdGenerator を渡さない＝ステートレス（SDK は未指定を undefined と同一に扱う）。
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: [`${host}:${boundPort}`, `localhost:${boundPort}`],
    });
    const mcp = createServer(store, serverOptions());
    res.on('close', () => {
      void transport.close();
      void mcp.close();
    });
    // SDK の Transport 実装は sessionId?/onclose? を自クラス field で宣言しており、
    // 本パッケージの exactOptionalPropertyTypes 下では connect() の引数型と optional の
    // 分散が食い違う。実行時は正当なトランスポートなので、メソッド自身の引数型へ橋渡す。
    await mcp.connect(transport as Parameters<typeof mcp.connect>[0]);
    await transport.handleRequest(req, res);
  }

  // createServer のオプションを指定有無に応じて組む（exactOptionalPropertyTypes 対応）。
  function serverOptions(): CreateServerOptions {
    const opt: CreateServerOptions = {};
    if (onLog !== undefined) opt.onLog = onLog;
    if (now !== undefined) opt.now = now;
    if (git !== undefined) opt.git = git;
    return opt;
  }

  let boundPort = 0;
  function currentPort(): number {
    return boundPort;
  }

  await new Promise<void>((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(options.port ?? 0, host, () => {
      const addr = httpServer.address();
      boundPort = typeof addr === 'object' && addr !== null ? addr.port : 0;
      httpServer.removeListener('error', rejectListen);
      resolveListen();
    });
  });

  return {
    port: boundPort,
    host,
    url: `http://${host}:${boundPort}${MCP_PATH}`,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        httpServer.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}
