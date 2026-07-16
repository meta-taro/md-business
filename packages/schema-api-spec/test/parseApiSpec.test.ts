import { describe, it, expect } from 'vitest';
import validate from '../dist/validate.compiled.js';
import { parseApiSpecMarkdown, parseApiSpecObject } from '../src/index.js';

const JAPANESE_MD = `---
スキーマ: api-spec/v1
文書番号: API-2026-001
タイトル: 受発注 API 詳細設計
版: 1.0.0
発行日: 2026-07-15
ステータス: 承認済
プロトコル: REST
認証: Bearer
ベースURL: https://api.example.com/v1
作成者:
  - 名前: 田中
    役割: PdM
エンドポイント:
  - オペレーションID: listUsers
    メソッド: get
    パス: /users
    概要: 利用者一覧
    リクエスト:
      クエリパラメータ:
        - 名前: page
          型: 整数
          必須: false
    レスポンス:
      - ステータス: 200
        説明: 成功
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: id
              型: 文字列
              DB参照: DB-2026-001#users.id
            - 名前: address
              型: オブジェクト
              要素:
                - 名前: zip
                  型: 文字列
      - ステータス: 401
        エラー参照: UNAUTHORIZED
エラー:
  - コード: UNAUTHORIZED
    HTTPステータス: 401
    メッセージ: 認証が必要です
---

# 本文

補足説明。
`;

describe('parseApiSpecMarkdown — success path', () => {
  it('parses Japanese frontmatter end-to-end', () => {
    const result = parseApiSpecMarkdown(JAPANESE_MD, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.apiSpec.schema).toBe('api-spec/v1');
    expect(result.apiSpec.documentNumber).toBe('API-2026-001');
    expect(result.apiSpec.status).toBe('approved');
    expect(result.apiSpec.protocol).toBe('rest');
    expect(result.apiSpec.auth).toBe('bearer');
    expect(result.apiSpec.endpoints).toHaveLength(1);
    const ep = result.apiSpec.endpoints[0]!;
    expect(ep.method).toBe('GET');
    expect(ep.request?.queryParams?.[0]?.type).toBe('integer');
    const body = ep.responses[0]?.body;
    expect(body?.fields[0]?.dbRef).toBe('DB-2026-001#users.id');
    expect(body?.fields[1]?.of?.[0]?.name).toBe('zip');
    expect(ep.responses[1]?.errorRef).toBe('UNAUTHORIZED');
    expect(result.apiSpec.errors?.[0]?.code).toBe('UNAUTHORIZED');
    expect(result.body).toContain('# 本文');
    expect(result.warnings).toEqual([]);
  });

  it('keeps dbRef cross-references verbatim', () => {
    const result = parseApiSpecMarkdown(JAPANESE_MD, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const field = result.apiSpec.endpoints[0]?.responses[0]?.body?.fields[0];
    expect(field?.dbRef).toBe('DB-2026-001#users.id');
  });
});

describe('parseApiSpecMarkdown — autofill defaults', () => {
  it('fills schema / version / status / protocol / auth when omitted', () => {
    const md = `---
文書番号: API-2026-002
タイトル: 最小構成
発行日: 2026-07-15
作成者:
  - 名前: 田中
エンドポイント:
  - オペレーションID: ping
    メソッド: GET
    パス: /ping
    レスポンス:
      - ステータス: 200
---
`;
    const result = parseApiSpecMarkdown(md, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.apiSpec.schema).toBe('api-spec/v1');
    expect(result.apiSpec.version).toBe('0.1.0');
    expect(result.apiSpec.status).toBe('draft');
    expect(result.apiSpec.protocol).toBe('rest');
    expect(result.apiSpec.auth).toBe('none');
  });
});

describe('parseApiSpecMarkdown — failure path', () => {
  it('fails when required endpoints is missing', () => {
    const md = `---
文書番号: API-2026-003
タイトル: エンドポイントなし
発行日: 2026-07-15
作成者:
  - 名前: 田中
---
`;
    const result = parseApiSpecMarkdown(md, validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.keyword === 'required')).toBe(true);
  });

  it('fails on an invalid protocol value', () => {
    const md = JAPANESE_MD.replace('プロトコル: REST', 'プロトコル: soap');
    const result = parseApiSpecMarkdown(md, validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path === '/protocol' && e.keyword === 'enum')).toBe(true);
  });

  it('fails on an out-of-range response status', () => {
    const md = JAPANESE_MD.replace('ステータス: 200', 'ステータス: 999');
    const result = parseApiSpecMarkdown(md, validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.keyword === 'maximum')).toBe(true);
  });
});

describe('parseApiSpecMarkdown — warnings surface', () => {
  it('surfaces normalize collision warnings on success', () => {
    const md = `---
タイトル: 衝突
title: collision
文書番号: API-2026-004
発行日: 2026-07-15
作成者:
  - 名前: 田中
エンドポイント:
  - オペレーションID: ping
    メソッド: GET
    パス: /ping
    レスポンス:
      - ステータス: 200
---
`;
    const result = parseApiSpecMarkdown(md, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'title')).toBe(true);
  });

  it('surfaces autofill design warnings (duplicate operationId)', () => {
    const md = `---
文書番号: API-2026-005
タイトル: 重複
発行日: 2026-07-15
作成者:
  - 名前: 田中
エンドポイント:
  - オペレーションID: dup
    メソッド: GET
    パス: /a
    レスポンス:
      - ステータス: 200
  - オペレーションID: dup
    メソッド: GET
    パス: /b
    レスポンス:
      - ステータス: 200
---
`;
    const result = parseApiSpecMarkdown(md, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'endpoints[1].operationId')).toBe(true);
  });
});

describe('parseApiSpecObject', () => {
  it('parses an already-split frontmatter object', () => {
    const result = parseApiSpecObject(
      {
        文書番号: 'API-2026-006',
        タイトル: 'オブジェクト入力',
        発行日: '2026-07-15',
        プロトコル: 'GraphQL',
        作成者: [{ 名前: '田中' }],
        エンドポイント: [
          { オペレーションID: 'q', メソッド: 'POST', パス: '/graphql', レスポンス: [{ ステータス: 200 }] },
        ],
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.apiSpec.protocol).toBe('graphql');
    expect(result.apiSpec.schema).toBe('api-spec/v1');
  });

  it('fails for a non-object input', () => {
    const result = parseApiSpecObject('not an object', validate);
    expect(result.ok).toBe(false);
  });
});
