/**
 * バンドル済みサイドカーのスモーク。
 * -----------------------------------------------------------------------------
 * 単体テストは src を直接読むので、「1 ファイルへ束ねたものが Node で本当に動くか」は
 * 別の問いになる（依存の取りこぼし・CJS/ESM の食い違いはここでしか出ない）。実際に
 * 子プロセスとして起動し、親が必要とする ready → set-root → 終了の一往復を確認する。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUNDLE = resolve(dirname(fileURLToPath(import.meta.url)), '../dist-sidecar/sidecar.cjs');

/** 子プロセスの stdout から、条件に合う 1 行 JSON が来るまで待つ。 */
function waitForEvent(
  child: ChildProcessWithoutNullStreams,
  match: (event: Record<string, unknown>) => boolean,
  timeoutMs = 15_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, rejectPromise) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      rejectPromise(new Error(`イベントを受け取れませんでした。受信済み: ${buffer}`));
    }, timeoutMs);
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === '') continue;
        const event = JSON.parse(line) as Record<string, unknown>;
        if (match(event)) {
          cleanup();
          resolvePromise(event);
          return;
        }
      }
    };
    function cleanup(): void {
      clearTimeout(timer);
      child.stdout.off('data', onData);
    }
    child.stdout.on('data', onData);
  });
}

describe('サイドカーのバンドル', () => {
  let workspace: string;
  let other: string;
  let child: ChildProcessWithoutNullStreams;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'mdbiz-bundle-a-'));
    other = await mkdtemp(join(tmpdir(), 'mdbiz-bundle-b-'));
  });

  afterAll(async () => {
    child?.kill();
    await rm(workspace, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  });

  it('バンドルが生成されている', () => {
    // 生成は `pnpm --filter @md-business/mcp-server bundle`。
    expect(existsSync(BUNDLE)).toBe(true);
  });

  it('子プロセスとして起動し、ready と set-root の応答を返す', async () => {
    child = spawn(process.execPath, [BUNDLE, workspace], { stdio: 'pipe' });

    const ready = await waitForEvent(child, (e) => e['type'] === 'ready');
    expect(ready['root']).toBe(resolve(workspace));
    expect(typeof ready['port']).toBe('number');
    // トークンは起動ごとに発行される。親はこれを読めた場合だけ接続できる。
    expect(String(ready['token']).length).toBeGreaterThanOrEqual(32);
    expect(String(ready['url'])).toContain(`127.0.0.1:${String(ready['port'])}/mcp`);

    child.stdin.write(`${JSON.stringify({ type: 'set-root', root: other })}\n`);
    const rootEvent = await waitForEvent(child, (e) => e['type'] === 'root');
    expect(rootEvent['root']).toBe(resolve(other));
  });

  it('stdin が閉じたら自分で終了する', async () => {
    const exited = new Promise<void>((resolvePromise) => {
      child.once('exit', () => {
        resolvePromise();
      });
    });
    child.stdin.end();
    await exited;
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
});
