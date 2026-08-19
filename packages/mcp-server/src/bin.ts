#!/usr/bin/env node
/**
 * md-business MCP サーバーの実行エントリポイント。
 * -----------------------------------------------------------------------------
 * stdio 経由で MCP クライアント（Claude Desktop 等）と接続する。ワークスペース root は
 * 第1引数 → 環境変数 MD_BUSINESS_WORKSPACE → カレントディレクトリ の順で解決する。
 *
 * 重要: stdout は MCP プロトコルの通信路。ログ・診断出力は必ず stderr に出す
 *（stdout に 1 行でも混ぜると JSON-RPC フレーミングが壊れる）。`--version` / `--health`
 * は待ち受けに入らないので、この制約の外にあり stdout へ書く。
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';
import { FileDocumentStore } from './fileStore.js';
import { createGitRunner } from './gitRunner.js';
import { createDesktopOpener } from './desktopOpener.js';
import { parseCliArgs, runInfoCommand } from './cli.js';
import { createLogSink, nodeLogFs } from './logSink.js';

async function main(): Promise<void> {
  const command = parseCliArgs(process.argv.slice(2));
  const rootArg = command.root ?? process.env['MD_BUSINESS_WORKSPACE'] ?? process.cwd();
  const root = resolve(rootArg);

  if (command.mode !== 'serve') {
    process.exitCode = await runInfoCommand(command, {
      root,
      store: new FileDocumentStore(root),
      versionLine: `${SERVER_NAME} ${SERVER_VERSION}`,
      out: (text) => process.stdout.write(text),
      err: (text) => process.stderr.write(text),
    });
    return;
  }

  const store = new FileDocumentStore(root);
  // ワークスペースが git 管理でなければ、各 git ツールが理由付きで失敗するだけ。
  const server = createServer(store, {
    git: createGitRunner(() => store.getRoot()),
    // 画面へ出す依頼は、アプリが動いていない状態から来ることの方が多い。
    desktop: createDesktopOpener({ getRoot: () => store.getRoot() }),
    // アプリ抜きで起動したときも作業ログは残す。設定はワークスペースの中にあるので、
    // どちらの起動でも同じ場所を読む。
    onLog: createLogSink({
      getRoot: () => store.getRoot(),
      fs: nodeLogFs(),
      warn: (message) => process.stderr.write(`[${SERVER_NAME}] ${message}
`),
    }),
  });
  const transport = new StdioServerTransport();

  await server.connect(transport);
  process.stderr.write(`[${SERVER_NAME} ${SERVER_VERSION}] workspace=${root} で待機中\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[${SERVER_NAME}] 起動に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
