import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startSidecar, type SidecarHandle } from './sidecar.js';

/** サイドカーが listen した HTTP エンドポイントへ MCP クライアントを繋ぐ。 */
async function connectMcp(url: string, token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  openClients.push(client);
  // exactOptionalPropertyTypes と SDK トランスポート型の分散差を、メソッド自身の引数型で埋める。
  await client.connect(transport as Parameters<typeof client.connect>[0]);
  return client;
}

/** 接続を閉じ忘れるとサーバーの close が待たされるので、後始末用に控えておく。 */
const openClients: Client[] = [];

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

/** 親へ流れてきた依頼イベントを待つ（HTTP 往復を挟むので 1 tick では届かない）。 */
async function waitForRequest(
  out: ReturnType<typeof collector>,
): Promise<{ type: 'request'; id: string; action: string; path: string }> {
  // 負荷が高いと HTTP 往復に時間がかかる。取りこぼしを誤検出にしないため余裕を持たせる。
  for (let i = 0; i < 300; i += 1) {
    const found = out.lines.find((l) => (l as { type: string }).type === 'request');
    if (found !== undefined) return found as { type: 'request'; id: string; action: string; path: string };
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('依頼イベントが届きませんでした');
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
    for (const c of openClients.splice(0)) await c.close().catch(() => undefined);
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

  it('希望ポートが使えれば同じポートで待ち受ける', async () => {
    // 前回と同じ接続先で立ち上がることが、保存した接続設定を使い続けられる条件。
    const first = await startSidecar({
      root: workspace,
      token: 'tok',
      io: { input, write: out.write },
    });
    const wanted = first.port;
    await first.stop();

    handle = await startSidecar({
      root: workspace,
      token: 'tok',
      port: wanted,
      io: { input, write: out.write },
    });

    expect(handle.port).toBe(wanted);
    expect(handle.portChanged).toBe(false);
  });

  it('希望ポートが塞がっていれば OS 割当へ落として起動する', async () => {
    // 他のアプリに取られていても MCP が起動しないのは困る。接続先が変わるだけに留める。
    const occupant = await startSidecar({
      root: other,
      token: 'tok',
      io: { input: new PassThrough(), write: () => {} },
    });

    try {
      handle = await startSidecar({
        root: workspace,
        token: 'tok',
        port: occupant.port,
        io: { input, write: out.write },
      });

      expect(handle.port).not.toBe(occupant.port);
      expect(handle.portChanged).toBe(true);
    } finally {
      await occupant.stop();
    }
  });

  it('git ツールを公開し、set-root 後は新しい root に対して git を実行する', async () => {
    // フォルダを切り替えたのに前のフォルダの git を見ていては、履歴が食い違う。
    const seen: string[][] = [];
    handle = await startSidecar({
      root: workspace,
      token: 'tok',
      io: { input, write: out.write },
      gitExec: async (args) => {
        seen.push(args);
        return { ok: true, stdout: '', stderr: '' };
      },
    });
    const client = await connectMcp(handle.url, 'tok');
    expect((await client.listTools()).tools.map((t) => t.name)).toContain('git_status');

    await send(input, JSON.stringify({ type: 'set-root', root: other }));
    await client.callTool({ name: 'git_status', arguments: {} });

    expect(seen[0]?.[1]).toBe(resolve(other));
  });

  it('export_pdf は依頼を親へ流し、応答を受けてツールの結果を返す', async () => {
    // 印刷できるのは画面を持つアプリだけなので、サーバーは依頼と応答の仲介に徹する。
    handle = await startSidecar({ root: workspace, token: 'tok', io: { input, write: out.write } });
    const client = await connectMcp(handle.url, 'tok');
    expect((await client.listTools()).tools.map((t) => t.name)).toContain('export_pdf');

    const call = client.callTool({ name: 'export_pdf', arguments: { path: 'invoices/INV-1.md' } });
    // 依頼が親へ届くまで待つ（応答はそれを見てから返す）。
    const request = await waitForRequest(out);
    expect(request).toMatchObject({ action: 'export-pdf', path: 'invoices/INV-1.md' });

    await send(input, JSON.stringify({ type: 'response', id: request.id, ok: true }));
    const result = (await call) as { isError?: boolean; content: { type: string; text: string }[] };
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toEqual({
      ok: true,
      path: 'invoices/INV-1.md',
    });
  });

  it('open_document も同じ経路を通り、応答がツールの結果になる', async () => {
    handle = await startSidecar({ root: workspace, token: 'tok', io: { input, write: out.write } });
    const client = await connectMcp(handle.url, 'tok');

    const call = client.callTool({ name: 'open_document', arguments: { path: 'specs/design.md' } });
    const request = await waitForRequest(out);
    expect(request).toMatchObject({ action: 'open-document', path: 'specs/design.md' });

    await send(input, JSON.stringify({ type: 'response', id: request.id, ok: true }));
    const result = (await call) as { isError?: boolean; content: { type: string; text: string }[] };
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toEqual({
      ok: true,
      path: 'specs/design.md',
    });
  });

  it('アプリが失敗を返せば、その理由をツールの結果に載せる', async () => {
    handle = await startSidecar({ root: workspace, token: 'tok', io: { input, write: out.write } });
    const client = await connectMcp(handle.url, 'tok');

    const call = client.callTool({ name: 'export_pdf', arguments: { path: 'a.md' } });
    const request = await waitForRequest(out);
    await send(
      input,
      JSON.stringify({ type: 'response', id: request.id, ok: false, error: '文書を開けません' }),
    );

    const result = (await call) as { isError?: boolean; content: { type: string; text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('文書を開けません');
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
