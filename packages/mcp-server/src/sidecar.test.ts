import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startSidecar, type SidecarHandle } from './sidecar.js';

/** 制御チャネルへ流した行を JSON として集める簡易受け手。 */
function collector(): { lines: unknown[]; write: (line: string) => void } {
  const lines: unknown[] = [];
  return {
    lines,
    write: (line: string) => {
      for (const part of line.split('\n')) {
        if (part !== '') lines.push(JSON.parse(part));
      }
    },
  };
}

/** stdin へ 1 行流し、リスナが処理し終わるまで待つ。 */
async function send(input: PassThrough, payload: string): Promise<void> {
  input.write(`${payload}\n`);
  await new Promise((r) => setImmediate(r));
}

describe('startSidecar', () => {
  let workspace: string;
  let other: string;
  let input: PassThrough;
  let out: ReturnType<typeof collector>;
  let handle: SidecarHandle | null;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'mdbiz-sidecar-a-'));
    other = await mkdtemp(join(tmpdir(), 'mdbiz-sidecar-b-'));
    input = new PassThrough();
    out = collector();
    handle = null;
  });

  afterEach(async () => {
    await handle?.stop();
    input.destroy();
    await rm(workspace, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  });

  it('listen 完了後に ready を 1 度だけ通知する', async () => {
    handle = await startSidecar({ root: workspace, token: 'tok', io: { input, write: out.write } });

    const ready = out.lines.filter((l) => (l as { type: string }).type === 'ready');
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({
      type: 'ready',
      token: 'tok',
      port: handle.port,
      url: handle.url,
      root: resolve(workspace),
    });
    // ready より前に URL を組めていないと親は接続先を知れない。
    expect(handle.url).toContain(`:${handle.port}/mcp`);
  });

  it('set-root で root を差し替え、受理を通知する', async () => {
    handle = await startSidecar({ root: workspace, token: 'tok', io: { input, write: out.write } });
    await send(input, JSON.stringify({ type: 'set-root', root: other }));

    expect(handle.root()).toBe(resolve(other));
    expect(out.lines).toContainEqual({ type: 'root', root: resolve(other) });
  });

  it('壊れた制御行はエラー通知に留め、その後のコマンドを受け付け続ける', async () => {
    handle = await startSidecar({ root: workspace, token: 'tok', io: { input, write: out.write } });
    await send(input, '{"type":');
    await send(input, JSON.stringify({ type: 'set-root', root: other }));

    expect(out.lines.some((l) => (l as { type: string }).type === 'error')).toBe(true);
    expect(handle.root()).toBe(resolve(other));
  });

  it('チャンクが行の途中で切れても組み立て直す', async () => {
    handle = await startSidecar({ root: workspace, token: 'tok', io: { input, write: out.write } });
    const payload = JSON.stringify({ type: 'set-root', root: other });
    input.write(payload.slice(0, 10));
    await new Promise((r) => setImmediate(r));
    await send(input, payload.slice(10));

    expect(handle.root()).toBe(resolve(other));
  });

  it('停止後は制御行を処理しない', async () => {
    handle = await startSidecar({ root: workspace, token: 'tok', io: { input, write: out.write } });
    const started = handle.root();
    await handle.stop();
    handle = null;
    input.write(`${JSON.stringify({ type: 'set-root', root: other })}\n`);
    await new Promise((r) => setImmediate(r));

    expect(out.lines.some((l) => (l as { type: string }).type === 'root')).toBe(false);
    expect(started).toBe(resolve(workspace));
  });
});
