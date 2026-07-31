import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { startHttpServer, type HttpServerHandle } from './httpServer.js';
import type { ToolLogEntry } from './toolLog.js';
import { MemoryDocumentStore } from './store.js';

/**
 * HTTP モードのスモーク：実際に 127.0.0.1 で listen し、bearer トークンを載せた
 * MCP クライアントが往復すること・トークン無しは 401 で弾かれること・ツール実行が
 * onLog へ流れることを、SDK の StreamableHTTP クライアント越しに確認する。
 */

const TOKEN = 'test-token-abc';
let handle: HttpServerHandle | null = null;
const clients: Client[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) await c.close().catch(() => undefined);
  if (handle !== null) {
    await handle.close().catch(() => undefined);
    handle = null;
  }
});

/** トークンを Authorization に載せて接続したクライアントを返す。 */
async function connect(url: string, token: string | null): Promise<Client> {
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  clients.push(client);
  // exactOptionalPropertyTypes と SDK トランスポート型の分散差を、メソッド自身の引数型で埋める。
  await client.connect(transport as Parameters<typeof client.connect>[0]);
  return client;
}

describe('startHttpServer / HTTP モード', () => {
  it('OS 割当ポートで listen し、URL に /mcp を含む', async () => {
    handle = await startHttpServer({ store: new MemoryDocumentStore(), token: TOKEN });
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}/mcp`);
  });

  it('正しいトークンのクライアントはツール一覧を取得できる', async () => {
    handle = await startHttpServer({ store: new MemoryDocumentStore(), token: TOKEN });
    const client = await connect(handle.url, TOKEN);
    const { tools } = await client.listTools();
    // 何本あるかは server.test.ts が見る。ここは HTTP 越しに同じサーバーが繋がることだけ。
    expect(tools.map((t) => t.name)).toContain('list_schemas');
  });

  it('ツール実行が onLog へ流れる', async () => {
    const logs: ToolLogEntry[] = [];
    handle = await startHttpServer({
      store: new MemoryDocumentStore(),
      token: TOKEN,
      onLog: (e) => logs.push(e),
    });
    const client = await connect(handle.url, TOKEN);
    const res = (await client.callTool({
      name: 'create_document',
      arguments: {
        schema: 'invoice/v1',
        frontmatter: { invoiceNumber: 'INV-1' },
        body: '# 請求書',
        path: 'invoices/INV-1.md',
      },
    })) as CallToolResult;
    expect(res.isError).not.toBe(true);
    expect(logs.some((e) => e.tool === 'create_document' && e.ok)).toBe(true);
  });

  it('git 実行器を渡すと HTTP 越しでも git ツールが公開される', async () => {
    handle = await startHttpServer({
      store: new MemoryDocumentStore(),
      token: TOKEN,
      git: { run: async () => ({ ok: true, stdout: '', stderr: '' }) },
    });
    const client = await connect(handle.url, TOKEN);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('git_status');
  });

  it('トークン無しのクライアントは 401 で拒否される', async () => {
    handle = await startHttpServer({ store: new MemoryDocumentStore(), token: TOKEN });
    await expect(connect(handle.url, null)).rejects.toThrow();
  });

  it('誤ったトークンのクライアントは拒否される', async () => {
    handle = await startHttpServer({ store: new MemoryDocumentStore(), token: TOKEN });
    await expect(connect(handle.url, 'wrong-token')).rejects.toThrow();
  });
});
