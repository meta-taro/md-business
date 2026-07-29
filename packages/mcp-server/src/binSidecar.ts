#!/usr/bin/env node
/**
 * HTTP モード（サイドカー）の実行エントリポイント。
 * -----------------------------------------------------------------------------
 * デスクトップアプリが子プロセスとして起動する。stdio モードの bin.ts と違い、
 * MCP 本体は HTTP に乗るので stdin/stdout は親との制御チャネルとして空いている。
 *   - stdout: ready / log / root / error を 1 行 1 JSON で親へ
 *   - stdin : set-root などのコマンドを親から
 *   - stderr: 人が読む診断のみ（親は解釈しない）
 *
 * bearer トークンは起動ごとにここで発行する。外から与えられる経路を作らないことで、
 * 「起動中プロセスの stdout を読めた親だけが接続できる」状態を保つ。
 */
import { randomBytes } from 'node:crypto';
import { startSidecar } from './sidecar.js';
import { encodeSidecarEvent } from './control.js';
import { SERVER_NAME } from './server.js';

async function main(): Promise<void> {
  const root = process.argv[2] ?? process.env['MD_BUSINESS_WORKSPACE'] ?? process.cwd();
  const token = randomBytes(32).toString('hex');

  const handle = await startSidecar({
    root,
    token,
    io: {
      input: process.stdin,
      write: (line) => {
        process.stdout.write(line);
      },
    },
  });

  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    void handle.stop().finally(() => {
      process.exit(0);
    });
  };

  // 親が制御チャネルを閉じた＝アプリ終了。孤児プロセスとして残らないよう自分で降りる。
  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // 親が読み取れる形と、人が読む形の両方へ出す（親は stdout の 1 行だけを見る）。
  process.stdout.write(encodeSidecarEvent({ type: 'error', message }));
  process.stderr.write(`[${SERVER_NAME}] 起動に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
