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
 * bearer トークンはここで発行する。値そのものが引数や環境変数に現れる経路は作らず、
 * 親へは stdout の ready 行でだけ渡す。
 *
 * 発行した接続情報（トークンとポート）は、親から保存先を渡された場合に限りそこへ書き、
 * 次回以降は同じ値で立ち上げる。起動のたびに接続先が変わると、AI クライアント側の設定を
 * 毎回書き直すことになり実用にならないため。
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { startSidecar } from './sidecar.js';
import { encodeSidecarEvent } from './control.js';
import { SERVER_NAME, SERVER_VERSION } from './server.js';
import { FileDocumentStore } from './fileStore.js';
import { parseCliArgs, runInfoCommand } from './cli.js';
import {
  parseSidecarState,
  resolveSidecarIdentity,
  serializeSidecarState,
  type SidecarState,
} from './sidecarState.js';

/** 保存済みの接続情報を読む。無い・読めない・壊れているはいずれも「保存なし」。 */
function loadState(path: string | undefined): SidecarState | null {
  if (path === undefined) return null;
  try {
    return parseSidecarState(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 接続情報を保存する。書けなくても起動は続ける（次回また発行するだけで、今回の
 * 接続は成立している）。合鍵なので所有者だけが読める権限で置く。
 */
function saveState(path: string | undefined, state: SidecarState): void {
  if (path === undefined) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeSidecarState(state), { encoding: 'utf8', mode: 0o600 });
  } catch {
    // 保存できない環境（読み取り専用など）でも MCP 自体は使える。
  }
}

async function main(): Promise<void> {
  // 利用者の手元にあるのはアプリへ同梱したこの 1 ファイルなので、接続できないときに
  // 確かめる先もここになる。待ち受けに入らない指定は、親が付けることはない。
  const command = parseCliArgs(process.argv.slice(2));
  if (command.mode !== 'serve') {
    const root = resolve(command.root ?? process.env['MD_BUSINESS_WORKSPACE'] ?? process.cwd());
    process.exitCode = await runInfoCommand(command, {
      root,
      store: new FileDocumentStore(root),
      versionLine: `${SERVER_NAME} ${SERVER_VERSION}`,
      // 待ち受けに入らないので、stdout は親との制御チャネルとして使われていない。
      out: (text) => process.stdout.write(text),
      err: (text) => process.stderr.write(text),
    });
    return;
  }

  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const root = positional[0] ?? process.env['MD_BUSINESS_WORKSPACE'] ?? process.cwd();
  const statePath = positional[1] ?? process.env['MD_BUSINESS_MCP_STATE'];
  const saved = loadState(statePath);
  const identity = resolveSidecarIdentity(saved, () => randomBytes(32).toString('hex'));

  const handle = await startSidecar({
    root,
    token: identity.token,
    port: identity.port,
    io: {
      input: process.stdin,
      write: (line) => {
        process.stdout.write(line);
      },
    },
  });

  // 発行し直したとき、または希望ポートが取れなかったときだけ書き戻す。
  if (identity.minted || handle.portChanged || identity.port !== handle.port) {
    saveState(statePath, { token: identity.token, port: handle.port });
  }

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
