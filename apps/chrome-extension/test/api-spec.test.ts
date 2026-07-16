import { describe, it, expect } from 'vitest';
import { apiSpecPlugin } from '../src/plugins/api-spec.js';
import { loadMarkdown, previewMarkdown } from '../src/shared/loadMarkdown.js';

const VALID_API_MD = `---
schema: "api-spec/v1"
documentNumber: "API-2026-0001"
title: "受発注 API 設計書"
version: "1.0.0"
issueDate: "2026-06-17"
status: "draft"
protocol: "rest"
auth: "bearer"
baseUrl: "https://api.example.com/v1"
authors:
  - name: "田中"
    role: "PdM"
endpoints:
  - operationId: "listOrders"
    method: "GET"
    path: "/orders"
    summary: "注文一覧を取得する"
    responses:
      - status: 200
        description: "注文の配列"
errors:
  - code: "UNAUTHORIZED"
    httpStatus: 401
    message: "認証に失敗しました"
---
`;

const JAPANESE_KEYED_API_MD = `---
文書番号: "API-J-001"
タイトル: "日本語キー API 設計書"
版: "0.2.0"
発行日: "2026-06-17"
ステータス: "レビュー中"
プロトコル: "REST"
認証: "Bearer"
作成者:
  - 名前: "山田"
    役割: "リード"
エンドポイント:
  - オペレーションID: "getUser"
    メソッド: "get"
    パス: "/users/{id}"
    概要: "ユーザーを取得する"
    リクエスト:
      パスパラメータ:
        - 名前: "id"
          型: "string"
          必須: true
    レスポンス:
      - ステータス: 200
        説明: "ユーザー"
---
`;

describe('apiSpecPlugin — validate path', () => {
  it('accepts a fully English-keyed valid api-spec', () => {
    const result = apiSpecPlugin.validate({
      schema: 'api-spec/v1',
      documentNumber: 'API-1',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      protocol: 'rest',
      auth: 'none',
      authors: [{ name: 'X' }],
      endpoints: [
        { operationId: 'ping', method: 'GET', path: '/ping', responses: [{ status: 200 }] },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects missing required documentNumber with translated message', () => {
    const result = apiSpecPlugin.validate({
      schema: 'api-spec/v1',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      protocol: 'rest',
      auth: 'none',
      authors: [{ name: 'X' }],
      endpoints: [
        { operationId: 'ping', method: 'GET', path: '/ping', responses: [{ status: 200 }] },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/文書番号/);
  });

  it('autofills defaults for Japanese-keyed minimal frontmatter', () => {
    const result = apiSpecPlugin.validate({
      文書番号: 'API-J-001',
      タイトル: '最小',
      発行日: '2026-06-17',
      作成者: [{ 名前: '田中' }],
      エンドポイント: [
        {
          オペレーションID: 'ping',
          メソッド: 'post',
          パス: '/rpc/ping',
          レスポンス: [{ ステータス: 200 }],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.version).toBe('0.1.0');
    expect(result.data.status).toBe('draft');
    expect(result.data.protocol).toBe('rest');
    expect(result.data.auth).toBe('none');
    expect(result.data.endpoints[0]?.path).toBe('/rpc/ping');
  });
});

describe('apiSpecPlugin — render (data-driven, no markdown body)', () => {
  it('renders the cover and endpoint catalog from structured frontmatter', () => {
    const result = apiSpecPlugin.validate({
      schema: 'api-spec/v1',
      documentNumber: 'API-2',
      title: '受発注 API',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      protocol: 'rest',
      auth: 'bearer',
      authors: [{ name: 'X' }],
      endpoints: [
        { operationId: 'listOrders', method: 'GET', path: '/orders', responses: [{ status: 200 }] },
      ],
    });
    if (!result.ok) throw new Error('expected ok');
    const html = apiSpecPlugin.render(result.data);
    expect(html).toContain('mdb-api-spec');
    expect(html).toContain('mdb-api-spec__cover');
    expect(html).toContain('/orders');
    expect(html).toContain('REST');
  });

  it('produces the api-spec article shell with the schema version', () => {
    const result = apiSpecPlugin.validate({
      schema: 'api-spec/v1',
      documentNumber: 'API-3',
      title: 't',
      version: '1.0.0',
      issueDate: '2026-06-17',
      status: 'draft',
      protocol: 'graphql',
      auth: 'apiKey',
      authors: [{ name: 'X' }],
      endpoints: [
        { operationId: 'q', method: 'POST', path: '/graphql', responses: [{ status: 200 }] },
      ],
    });
    if (!result.ok) throw new Error('expected ok');
    const html = apiSpecPlugin.render(result.data);
    expect(html).toContain('data-schema-version="api-spec/v1"');
  });
});

describe('apiSpecPlugin — previewRender', () => {
  it('returns HTML even when required fields are missing', () => {
    const result = apiSpecPlugin.previewRender?.({ title: 'まだ書きかけ' });
    expect(result).toBeDefined();
    if (!result) return;
    expect(result.html).toContain('mdb-api-spec');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('translates errors to Japanese', () => {
    const result = apiSpecPlugin.previewRender?.({});
    if (!result) throw new Error('expected previewRender');
    expect(result.errors.map((e) => e.message).join('\n')).toMatch(/必須/);
  });

  it('surfaces a fatal message when a partial doc cannot be rendered', () => {
    // An endpoint missing `method` slips past withPreviewDefaults (which only
    // fills top-level keys) and makes renderApiSpecBody throw on
    // `endpoint.method.toLowerCase()`. previewRender must catch it and return a
    // fatal notice rather than propagating the exception to the editor.
    const result = apiSpecPlugin.previewRender?.({
      title: '壊れかけ',
      endpoints: [{ path: '/x' }],
    });
    if (!result) throw new Error('expected previewRender');
    expect(result.fatal).toBeDefined();
    expect(result.fatal).toMatch(/プレビューを描画できませんでした/);
    expect(result.html).toBe('');
  });

  it('returns no errors for a fully valid document (no preview defaults injected)', () => {
    // Exercising the happy path with every required field present ensures the
    // withPreviewDefaults `value already set` branches and the validation.ok
    // side of previewRender are covered.
    const result = apiSpecPlugin.previewRender?.({
      schema: 'api-spec/v1',
      documentNumber: 'API-9',
      title: '完成版',
      version: '2.0.0',
      issueDate: '2026-06-17',
      status: 'approved',
      protocol: 'rest',
      auth: 'oauth2',
      authors: [{ name: '田中' }],
      endpoints: [
        { operationId: 'ping', method: 'GET', path: '/ping', responses: [{ status: 200 }] },
      ],
    });
    if (!result) throw new Error('expected previewRender');
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('mdb-api-spec');
    expect(result.html).toContain('完成版');
  });
});

describe('apiSpecPlugin — documentTitle / pdfFileName', () => {
  const full = {
    schema: 'api-spec/v1' as const,
    documentNumber: 'API-1',
    title: '受発注 API',
    version: '1.2.0',
    issueDate: '2026-06-17',
    status: 'draft' as const,
    protocol: 'rest' as const,
    auth: 'bearer' as const,
    authors: [{ name: 'X' }],
    endpoints: [
      {
        operationId: 'ping',
        method: 'GET' as const,
        path: '/ping',
        responses: [{ status: 200 }],
      },
    ],
  };

  it('uses the api-spec title as the document title', () => {
    expect(apiSpecPlugin.documentTitle?.(full)).toBe('受発注 API');
  });

  it('falls back to "API 設計書 {番号}" when title is empty', () => {
    expect(apiSpecPlugin.documentTitle?.({ ...full, title: '' })).toBe('API 設計書 API-1');
  });

  it('renders the default PDF file name', () => {
    expect(apiSpecPlugin.pdfFileName?.(full)).toBe('API設計書_API-1_v1.2.0');
  });
});

describe('loadMarkdown — api-spec end-to-end', () => {
  it('routes an api-spec/v1 markdown through the registry', () => {
    const result = loadMarkdown(VALID_API_MD);
    if (!result.ok) throw new Error(`expected success: ${result.reason}`);
    expect(result.pluginId).toBe('api-spec');
    expect(result.stylesHref).toBe('styles/api-spec.css');
    expect(result.documentTitle).toBe('受発注 API 設計書');
    expect(result.bodyHtml).toContain('mdb-api-spec');
    expect(result.bodyHtml).toContain('/orders');
    expect(result.bodyHtml).toContain('https://api.example.com/v1');
  });

  it('routes a Japanese-keyed api-spec via plugin.detect (not misrouted to spec)', () => {
    const result = loadMarkdown(JAPANESE_KEYED_API_MD);
    if (!result.ok) throw new Error(`expected success: ${result.reason}`);
    expect(result.pluginId).toBe('api-spec');
    expect(result.documentTitle).toBe('日本語キー API 設計書');
  });
});

describe('previewMarkdown — api-spec live editor', () => {
  it('returns body HTML even when required fields are missing', () => {
    const partial = `---\ntitle: "途中"\n文書番号: "API-X"\nエンドポイント: []\n---\n`;
    const result = previewMarkdown(partial);
    if (!result.ok) throw new Error('expected success');
    expect(result.bodyHtml).toContain('mdb-api-spec');
  });
});
