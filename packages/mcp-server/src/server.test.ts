import { describe, it, expect } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createServer, SERVER_NAME } from './server.js';
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

/** InMemoryTransport でサーバーへ繋いだ Client を返す。 */
async function connect(store: MemoryDocumentStore): Promise<Client> {
  const server = createServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

/** CallToolResult のテキスト content を JSON パースして取り出す。 */
function parse(result: CallToolResult): { text: unknown; isError: boolean } {
  const first = result.content[0];
  if (first === undefined || first.type !== 'text') throw new Error('text content が無い');
  return { text: JSON.parse(first.text), isError: result.isError === true };
}

describe('createServer / MCP 配線', () => {
  it('list_tools で 6 つの P0 ツールを公開する', async () => {
    const client = await connect(new MemoryDocumentStore());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_document',
      'list_schemas',
      'read_document',
      'search_documents',
      'update_document',
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

  it('サーバー情報に名前が載る', async () => {
    const client = await connect(new MemoryDocumentStore());
    expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
  });
});
