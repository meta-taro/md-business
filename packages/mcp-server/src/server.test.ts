import { describe, it, expect } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createServer, SERVER_NAME } from './server.js';
import type { GitRunner, GitRunResult } from './gitTools.js';
import type { ToolLogEntry } from './toolLog.js';
import { MemoryDocumentStore } from './store.js';

/**
 * server.ts は「zod で入力宣言 → 検証済みツール関数へ配線」する層。ロジックは各ツールの
 * 単体テストで担保済みなので、ここは配線が実際に動くこと＝InMemoryTransport 越しに
 * Client.callTool → コールバック → ツール関数 → テキスト結果が往復することを見る。
 */

// templates/invoice/standard.md の frontmatter（schemaVersion: invoice/v1・ajv 妥当）
const VALID_INVOICE = `---
schemaVersion: invoice/v1
invoiceNumber: INV-2026-0001
issueDate: "2026-06-30"
dueDate: "2026-07-31"
issuer:
  name: 株式会社サンプル発行元
  registrationNumber: T1234567890123
  postalCode: 100-0001
  address: 東京都千代田区千代田1-1
  tel: 03-0000-0000
  email: billing@example.com
recipient:
  name: 株式会社サンプル受領先
  honorific: 御中
  postalCode: 150-0001
  address: 東京都渋谷区神宮前1-1
items:
  - name: 業務委託費
    quantity: 1
    unit: 式
    unitPrice: 500000
    taxRate: 10
taxSummary:
  standard:
    rate: 10
    subtotal: 500000
    tax: 50000
  reduced:
    rate: 8
    subtotal: 0
    tax: 0
  exempt:
    rate: 0
    subtotal: 0
    tax: 0
totals:
  subtotal: 500000
  tax: 50000
  total: 550000
---

# 請求書

本文。`;

/** 検証シートの最小 TSV（型付きヘッダ + データ 1 行）。 */
const SHEET_TSV = 'No.:number\t項目!\t結果:enum(OK|NG)\n1\t新規登録\tOK\n';

/** InMemoryTransport でサーバーへ繋いだ Client を返す。 */
async function connect(store: MemoryDocumentStore): Promise<Client> {
  const server = createServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

/** onLog をスパイしつつ繋いだ Client と、蓄積した操作ログ配列を返す（時刻は固定）。 */
async function connectWithLog(
  store: MemoryDocumentStore,
): Promise<{ client: Client; logs: ToolLogEntry[] }> {
  const logs: ToolLogEntry[] = [];
  const server = createServer(store, { onLog: (e) => logs.push(e), now: () => 12345 });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, logs };
}

/** CallToolResult のテキスト content を JSON パースして取り出す。 */
function parse(result: CallToolResult): { text: unknown; isError: boolean } {
  const first = result.content[0];
  if (first === undefined || first.type !== 'text') throw new Error('text content が無い');
  return { text: JSON.parse(first.text), isError: result.isError === true };
}

describe('createServer / MCP 配線', () => {
  it('list_tools で P0 ツール一式を公開する', async () => {
    const client = await connect(new MemoryDocumentStore());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'append_tsv_row',
      'create_document',
      'get_schema',
      'list_schemas',
      'read_document',
      'read_tsv',
      'search_documents',
      'update_document',
      'update_tsv_row',
      'validate_document',
    ]);
  });

  it('list_schemas は 6 スキーマを返す', async () => {
    const client = await connect(new MemoryDocumentStore());
    const res = await client.callTool({ name: 'list_schemas', arguments: {} });
    const { text, isError } = parse(res as CallToolResult);
    expect(isError).toBe(false);
    expect((text as { schemas: unknown[] }).schemas).toHaveLength(6);
  });

  // list_schemas は id と表示名しか返さないので、エージェントは「どの項目が必須か」を
  // 知らないまま create_document を撃つしかなかった。get_schema はその手前に置く。
  it('get_schema は JSON Schema 本体を返す', async () => {
    const client = await connect(new MemoryDocumentStore());
    const res = await client.callTool({
      name: 'get_schema',
      arguments: { schema: 'invoice/v1' },
    });
    const { text, isError } = parse(res as CallToolResult);
    expect(isError).toBe(false);
    const payload = text as { ok: boolean; id: string; label: string; schema: object };
    expect(payload.ok).toBe(true);
    expect(payload.id).toBe('invoice/v1');
    expect(payload.label.length).toBeGreaterThan(0);
    expect(payload.schema).toHaveProperty('properties');
    // 実際に必須項目が読める＝create_document の前段として機能する
    expect((payload.schema as { required?: string[] }).required).toContain('invoiceNumber');
  });

  it('get_schema は未知 id を isError で返す', async () => {
    const client = await connect(new MemoryDocumentStore());
    const res = await client.callTool({
      name: 'get_schema',
      arguments: { schema: 'unknown/v9' },
    });
    const { text, isError } = parse(res as CallToolResult);
    expect(isError).toBe(true);
    const payload = text as { ok: boolean; error: string };
    expect(payload.ok).toBe(false);
    // 次の一手（list_schemas）へ誘導する
    expect(payload.error).toContain('list_schemas');
  });

  it('create_document → read_document → validate_document が往復する', async () => {
    const store = new MemoryDocumentStore();
    const client = await connect(store);

    const created = parse(
      (await client.callTool({
        name: 'create_document',
        arguments: {
          schema: 'invoice/v1',
          frontmatter: { invoiceNumber: 'INV-9' },
          body: '# 請求書',
          path: 'invoices/INV-9.md',
        },
      })) as CallToolResult,
    );
    expect(created.isError).toBe(false);
    expect((created.text as { path: string }).path).toBe('invoices/INV-9.md');
    // frontmatter 不足なので valid=false でも書き込みは成功する
    expect((created.text as { valid: boolean }).valid).toBe(false);

    const read = parse(
      (await client.callTool({
        name: 'read_document',
        arguments: { path: 'invoices/INV-9.md' },
      })) as CallToolResult,
    );
    expect(read.isError).toBe(false);
    expect((read.text as { schema: string }).schema).toBe('invoice/v1');
  });

  it('read_document の存在しないパスは isError を立てる', async () => {
    const client = await connect(new MemoryDocumentStore());
    const res = (await client.callTool({
      name: 'read_document',
      arguments: { path: 'missing.md' },
    })) as CallToolResult;
    expect(parse(res).isError).toBe(true);
  });

  it('validate_document は正しい請求書を valid と判定する', async () => {
    const store = new MemoryDocumentStore();
    await store.write('invoices/ok.md', VALID_INVOICE);
    const client = await connect(store);
    const res = (await client.callTool({
      name: 'validate_document',
      arguments: { path: 'invoices/ok.md' },
    })) as CallToolResult;
    const { text, isError } = parse(res);
    expect(isError).toBe(false);
    expect((text as { valid: boolean }).valid).toBe(true);
  });

  it('update_document は diff と再検証を返す', async () => {
    const store = new MemoryDocumentStore();
    await store.write('invoices/ok.md', VALID_INVOICE);
    const client = await connect(store);
    const res = (await client.callTool({
      name: 'update_document',
      arguments: { path: 'invoices/ok.md', body: '# 請求書（改訂）' },
    })) as CallToolResult;
    const { text, isError } = parse(res);
    expect(isError).toBe(false);
    expect(Array.isArray((text as { diff: unknown[] }).diff)).toBe(true);
    expect((text as { valid: boolean }).valid).toBe(true);
  });

  it('search_documents は schema で絞り込める', async () => {
    const store = new MemoryDocumentStore();
    await store.write('invoices/ok.md', VALID_INVOICE);
    await store.write('notes/plain.md', '# ただのメモ');
    const client = await connect(store);
    const res = (await client.callTool({
      name: 'search_documents',
      arguments: { schema: 'invoice/v1' },
    })) as CallToolResult;
    const { text } = parse(res);
    const matches = (text as { matches: Array<{ path: string }> }).matches;
    expect(matches).toHaveLength(1);
    expect(matches[0]?.path).toBe('invoices/ok.md');
  });

  // 検証シートは Markdown ではなくカスタム TSV なので、read_document 系では触れない。
  // 行単位ツールを通すことで「AI が検証シートに結果を書き込む」経路が繋がる。
  it('read_tsv は列定義と行を返す', async () => {
    const store = new MemoryDocumentStore();
    await store.write('sheets/t.tsv', SHEET_TSV);
    const client = await connect(store);
    const res = (await client.callTool({
      name: 'read_tsv',
      arguments: { path: 'sheets/t.tsv' },
    })) as CallToolResult;
    const { text, isError } = parse(res);
    expect(isError).toBe(false);
    const payload = text as { ok: boolean; columns: Array<{ name: string }>; rows: string[][] };
    expect(payload.ok).toBe(true);
    expect(payload.columns.map((c) => c.name)).toEqual(['No.', '項目', '結果']);
    expect(payload.rows).toHaveLength(1);
  });

  it('read_tsv は存在しないパスを isError で返す', async () => {
    const client = await connect(new MemoryDocumentStore());
    const res = (await client.callTool({
      name: 'read_tsv',
      arguments: { path: 'sheets/none.tsv' },
    })) as CallToolResult;
    expect(parse(res).isError).toBe(true);
  });

  it('append_tsv_row は列名指定で 1 行追加する', async () => {
    const store = new MemoryDocumentStore();
    await store.write('sheets/t.tsv', SHEET_TSV);
    const client = await connect(store);
    const res = (await client.callTool({
      name: 'append_tsv_row',
      arguments: { path: 'sheets/t.tsv', values: { 'No.': '2', 項目: '追加項目', 結果: 'OK' } },
    })) as CallToolResult;
    const { text, isError } = parse(res);
    expect(isError).toBe(false);
    const payload = text as { row: number; values: string[] };
    expect(payload.row).toBe(1);
    expect(payload.values).toEqual(['2', '追加項目', 'OK']);
    expect(await store.read('sheets/t.tsv')).toContain('追加項目');
  });

  it('append_tsv_row は未知の列名を isError で返す', async () => {
    const store = new MemoryDocumentStore();
    await store.write('sheets/t.tsv', SHEET_TSV);
    const client = await connect(store);
    const res = (await client.callTool({
      name: 'append_tsv_row',
      arguments: { path: 'sheets/t.tsv', values: { 無い列: 'x' } },
    })) as CallToolResult;
    expect(parse(res).isError).toBe(true);
    expect(await store.read('sheets/t.tsv')).toBe(SHEET_TSV);
  });

  it('update_tsv_row は指定列だけを差し替える', async () => {
    const store = new MemoryDocumentStore();
    await store.write('sheets/t.tsv', SHEET_TSV);
    const client = await connect(store);
    const res = (await client.callTool({
      name: 'update_tsv_row',
      arguments: { path: 'sheets/t.tsv', row: 0, values: { 結果: 'NG' } },
    })) as CallToolResult;
    const { text, isError } = parse(res);
    expect(isError).toBe(false);
    expect((text as { values: string[] }).values).toEqual(['1', '新規登録', 'NG']);
  });

  it('update_tsv_row は範囲外の行を isError で返す', async () => {
    const store = new MemoryDocumentStore();
    await store.write('sheets/t.tsv', SHEET_TSV);
    const client = await connect(store);
    const res = (await client.callTool({
      name: 'update_tsv_row',
      arguments: { path: 'sheets/t.tsv', row: 9, values: { 結果: 'NG' } },
    })) as CallToolResult;
    expect(parse(res).isError).toBe(true);
    expect(await store.read('sheets/t.tsv')).toBe(SHEET_TSV);
  });

  it('サーバー情報に名前が載る', async () => {
    const client = await connect(new MemoryDocumentStore());
    expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
  });
});

describe('createServer / git ツール', () => {
  /** 呼ばれた引数を記録し、決まった結果を順に返すフェイク git。 */
  function fakeGit(results: GitRunResult[]): GitRunner & { calls: string[][] } {
    const calls: string[][] = [];
    return {
      calls,
      run: async (args: string[]) => {
        calls.push(args);
        return results.shift() ?? { ok: true, stdout: '', stderr: '' };
      },
    };
  }

  async function connectWithGit(git: GitRunner): Promise<Client> {
    const server = createServer(new MemoryDocumentStore(), { git });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return client;
  }

  it('git 実行器が無ければ git ツールは公開しない', async () => {
    const client = await connect(new MemoryDocumentStore());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).filter((n) => n.startsWith('git_'))).toEqual([]);
  });

  it('git 実行器があれば status / diff / commit の 3 本を公開する', async () => {
    const client = await connectWithGit(fakeGit([]));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).filter((n) => n.startsWith('git_')).sort()).toEqual([
      'git_commit',
      'git_diff',
      'git_status',
    ]);
  });

  // push は人が内容を確認してから実行する運用。エージェントから叩ける口は作らない。
  it('git_push は公開しない', async () => {
    const client = await connectWithGit(fakeGit([]));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain('git_push');
  });

  it('git_status は変更一覧を返す', async () => {
    const git = fakeGit([{ ok: true, stdout: '# branch.head main\0? memo.md\0', stderr: '' }]);
    const client = await connectWithGit(git);
    const res = (await client.callTool({ name: 'git_status', arguments: {} })) as CallToolResult;
    const { text, isError } = parse(res);
    expect(isError).toBe(false);
    expect(text).toMatchObject({ ok: true, branch: 'main' });
  });

  it('git_commit はメッセージを git へそのまま渡す', async () => {
    const git = fakeGit([
      { ok: true, stdout: '', stderr: '' },
      { ok: true, stdout: '', stderr: '' },
      { ok: true, stdout: 'abc123\n', stderr: '' },
      { ok: true, stdout: '# branch.head main\0', stderr: '' },
    ]);
    const client = await connectWithGit(git);
    const res = (await client.callTool({
      name: 'git_commit',
      arguments: { message: '請求書を追加' },
    })) as CallToolResult;
    expect(parse(res).isError).toBe(false);
    expect(git.calls[1]).toEqual(['commit', '-m', '請求書を追加']);
  });

  it('git の失敗は isError で返す', async () => {
    const git = fakeGit([{ ok: false, stdout: '', stderr: 'fatal: not a git repository' }]);
    const client = await connectWithGit(git);
    const res = (await client.callTool({ name: 'git_status', arguments: {} })) as CallToolResult;
    expect(parse(res).isError).toBe(true);
  });

  it('git ツールの実行も操作ログに流れる', async () => {
    const logs: ToolLogEntry[] = [];
    const server = createServer(new MemoryDocumentStore(), {
      git: fakeGit([{ ok: true, stdout: '# branch.head main\0', stderr: '' }]),
      onLog: (e) => logs.push(e),
      now: () => 12345,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    await client.callTool({ name: 'git_status', arguments: {} });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tool).toBe('git_status');
  });
});

describe('createServer / onLog フック', () => {
  it('成功ツールは ok=true・path 付きのログを 1 件発火する', async () => {
    const { client, logs } = await connectWithLog(new MemoryDocumentStore());
    await client.callTool({
      name: 'create_document',
      arguments: {
        schema: 'invoice/v1',
        frontmatter: { invoiceNumber: 'INV-9' },
        body: '# 請求書',
        path: 'invoices/INV-9.md',
      },
    });
    expect(logs).toEqual([
      { type: 'log', tool: 'create_document', ok: true, ts: 12345, path: 'invoices/INV-9.md' },
    ]);
  });

  it('失敗ツールは ok=false・detail 付きのログを発火する', async () => {
    const { client, logs } = await connectWithLog(new MemoryDocumentStore());
    await client.callTool({ name: 'read_document', arguments: { path: 'missing.md' } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.ok).toBe(false);
    expect(logs[0]?.tool).toBe('read_document');
    expect(logs[0]?.path).toBe('missing.md');
    expect(typeof logs[0]?.detail).toBe('string');
  });

  it('パスを持たないツール（list_schemas）は path 無しのログを発火する', async () => {
    const { client, logs } = await connectWithLog(new MemoryDocumentStore());
    await client.callTool({ name: 'list_schemas', arguments: {} });
    expect(logs).toEqual([{ type: 'log', tool: 'list_schemas', ok: true, ts: 12345 }]);
  });

  it('get_schema は未知 id で ok=false・detail 付きのログを発火する', async () => {
    const { client, logs } = await connectWithLog(new MemoryDocumentStore());
    await client.callTool({ name: 'get_schema', arguments: { schema: 'unknown/v9' } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tool).toBe('get_schema');
    expect(logs[0]?.ok).toBe(false);
    expect(logs[0]?.path).toBeUndefined();
    expect(typeof logs[0]?.detail).toBe('string');
  });

  it('TSV 系ツールも path 付きでログを発火する', async () => {
    const store = new MemoryDocumentStore();
    await store.write('sheets/t.tsv', SHEET_TSV);
    const logs: ToolLogEntry[] = [];
    const server = createServer(store, { onLog: (e) => logs.push(e), now: () => 12345 });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    await client.callTool({
      name: 'append_tsv_row',
      arguments: { path: 'sheets/t.tsv', values: { 'No.': '2' } },
    });
    expect(logs).toEqual([
      { type: 'log', tool: 'append_tsv_row', ok: true, ts: 12345, path: 'sheets/t.tsv' },
    ]);
  });

  it('onLog 未指定でもツールは通常どおり動く（発火は完全に no-op）', async () => {
    // onLog を渡さない既定 connect でツールが往復すれば、フックは既存挙動を壊していない。
    const client = await connect(new MemoryDocumentStore());
    const res = await client.callTool({ name: 'list_schemas', arguments: {} });
    expect((res as CallToolResult).isError).not.toBe(true);
  });
});
