#!/usr/bin/env node
/**
 * md-business MCP サーバーの実行エントリポイント（Issue 004 Phase 2・Block MCP-6）。
 * -----------------------------------------------------------------------------
 * stdio 経由で MCP クライアント（Claude Desktop 等）と接続する。ワークスペース root は
 * 第1引数 → 環境変数 MD_BUSINESS_WORKSPACE → カレントディレクトリ の順で解決する。
 *
 * 重要: stdout は MCP プロトコルの通信路。ログ・診断出力は必ず stderr に出す
 *（stdout に 1 行でも混ぜると JSON-RPC フレーミングが壊れる）。
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';
import { FileDocumentStore } from './fileStore.js';

async function main(): Promise<void> {
  const rootArg = process.argv[2] ?? process.env['MD_BUSINESS_WORKSPACE'] ?? process.cwd();
  const root = resolve(rootArg);

  const store = new FileDocumentStore(root);
  const server = createServer(store);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  process.stderr.write(`[${SERVER_NAME} ${SERVER_VERSION}] workspace=${root} で待機中\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[${SERVER_NAME}] 起動に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
