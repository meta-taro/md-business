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

/** バンドルを指定の引数で走らせ、終わるまで待って終了コードと stdout を返す。 */
function run(args: string[], timeoutMs = 30_000): Promise<{ code: number | null; out: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [BUNDLE, ...args], { stdio: 'pipe' });
    let out = '';
    const timer = setTimeout(() => {
      child.kill();
      rejectPromise(new Error(`終わりませんでした。受信済み: ${out}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, out });
    });
    // 待ち受けに入らない指定なので、制御チャネルは使わない。
    child.stdin.end();
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

/**
 * 利用者の手元にあるのは、この 1 ファイル（アプリに同梱されたもの）だけ。
 * 接続できないときに確かめられるのもここなので、待ち受けに入らない指定を通しておく。
 */
describe('サイドカーのバンドル — 手元で確かめる', () => {
  let workspace: string;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'mdbiz-bundle-c-'));
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('版を尋ねたら、待ち受けに入らず答えて終わる', async () => {
    const { code, out } = await run(['--version']);
    expect(code).toBe(0);
    expect(out).toMatch(/md-business \d+\.\d+\.\d+/);
  });

  it('点検は、指した場所を読めれば通る', async () => {
    const { code, out } = await run(['--health', workspace]);
    expect(code).toBe(0);
    expect(out).toContain('OK  ワークスペース');
    expect(out).toContain('OK  スキーマ');
    expect(out).not.toContain('NG');
  });

  it('点検は、読めない場所を指していたら理由を出して失敗する', async () => {
    const { code, out } = await run(['--health', join(workspace, '無い')]);
    expect(code).toBe(1);
    expect(out).toContain('NG  ワークスペース');
  });
});
