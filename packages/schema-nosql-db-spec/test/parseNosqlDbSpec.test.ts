import { describe, it, expect } from 'vitest';
import validate from '../dist/validate.compiled.js';
import { parseNosqlDbSpecMarkdown, parseNosqlDbSpecObject } from '../src/index.js';

const JAPANESE_MD = `---
スキーマ: nosql-db-spec/v1
文書番号: NDB-2026-001
タイトル: ユーザーストア設計
発行日: 2026-07-02
エンジン: Firestore
ステータス: 承認済
作成者:
  - 名前: 田中
    役割: PdM
コレクション:
  - パス: users/{userId}
    ドキュメントID戦略: 認証UID
    形状:
      表示名:
        型: 文字列
        必須: true
      タグ:
        型: 配列
        要素:
          型: 文字列
    インデックス:
      - フィールド: [表示名]
        スコープ: コレクショングループ
        モード: 降順
    TTL:
      フィールド: 表示名
      有効: true
セキュリティルール:
  - 対象: /users/{userId}
    許可: [読み取り, 更新]
    条件: request.auth.uid == userId
---

# 本文

コレクション解説。
`;

describe('parseNosqlDbSpecMarkdown — success', () => {
  it('parses a Japanese-keyed document end to end', () => {
    const result = parseNosqlDbSpecMarkdown(JAPANESE_MD, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.nosqlDbSpec.engine).toBe('firestore');
    expect(result.nosqlDbSpec.status).toBe('approved');
    expect(result.nosqlDbSpec.collections[0]?.path).toBe('users/{userId}');
    expect(result.nosqlDbSpec.collections[0]?.docIdStrategy).toBe('auth-uid');
    expect(result.body).toContain('コレクション解説');
  });

  it('keeps shape field names verbatim while translating fieldDef values', () => {
    const result = parseNosqlDbSpecMarkdown(JAPANESE_MD, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shape = result.nosqlDbSpec.collections[0]?.shape;
    expect(shape?.['表示名']?.type).toBe('string');
    expect(shape?.['表示名']?.required).toBe(true);
    expect(shape?.['タグ']?.type).toBe('array');
    expect(shape?.['タグ']?.of?.type).toBe('string');
  });

  it('translates index / ttl / securityRule vocabulary', () => {
    const result = parseNosqlDbSpecMarkdown(JAPANESE_MD, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const col = result.nosqlDbSpec.collections[0];
    expect(col?.indexes?.[0]?.scope).toBe('collection-group');
    expect(col?.indexes?.[0]?.mode).toBe('DESCENDING');
    expect(col?.ttl?.enabled).toBe(true);
    expect(result.nosqlDbSpec.securityRules?.[0]?.allow).toEqual(['read', 'update']);
    expect(result.nosqlDbSpec.securityRules?.[0]?.if).toBe('request.auth.uid == userId');
  });

  it('autofills schema / version / status defaults', () => {
    const md = `---
文書番号: NDB-2026-002
タイトル: 最小構成
発行日: 2026-07-02
エンジン: dynamodb
作成者:
  - 名前: 田中
コレクション:
  - パス: sessions
    ドキュメントID戦略: 複合
    パーティションキー: tenantId
    ソートキー: createdAt
    形状:
      tenantId:
        型: 文字列
      createdAt:
        型: タイムスタンプ
---
`;
    const result = parseNosqlDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nosqlDbSpec.schema).toBe('nosql-db-spec/v1');
    expect(result.nosqlDbSpec.version).toBe('0.1.0');
    expect(result.nosqlDbSpec.status).toBe('draft');
    expect(result.warnings).toEqual([]);
  });
});

describe('parseNosqlDbSpecMarkdown — failure', () => {
  it('fails when collections is missing', () => {
    const md = `---
文書番号: NDB-2026-003
タイトル: 欠落
発行日: 2026-07-02
エンジン: firestore
作成者:
  - 名前: 田中
---
`;
    const result = parseNosqlDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.message.includes("'collections'")),
    ).toBe(true);
  });

  it('fails on an unknown engine value', () => {
    const md = JAPANESE_MD.replace('エンジン: Firestore', 'エンジン: OracleNoSQL');
    const result = parseNosqlDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path === '/engine')).toBe(true);
  });
});

describe('parseNosqlDbSpecMarkdown — warnings surface', () => {
  it('surfaces normalize collision warnings on success', () => {
    const md = JAPANESE_MD.replace(
      'タイトル: ユーザーストア設計',
      'タイトル: ユーザーストア設計\ntitle: duplicate',
    );
    const result = parseNosqlDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'title')).toBe(true);
  });

  it('surfaces autofill consistency warnings on success', () => {
    const md = JAPANESE_MD.replace('フィールド: 表示名', 'フィールド: expiresAt');
    const result = parseNosqlDbSpecMarkdown(md, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.warnings.some((w) => w.path === 'collections[0].ttl.field'),
    ).toBe(true);
  });
});

describe('parseNosqlDbSpecObject', () => {
  it('accepts an already-parsed frontmatter object', () => {
    const result = parseNosqlDbSpecObject(
      {
        文書番号: 'NDB-2026-004',
        タイトル: 'オブジェクト直渡し',
        発行日: '2026-07-02',
        エンジン: 'mongodb',
        作成者: [{ 名前: '田中' }],
        コレクション: [
          {
            パス: 'logs',
            ドキュメントID戦略: '自動',
            形状: { message: { 型: '文字列' } },
          },
        ],
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nosqlDbSpec.engine).toBe('mongodb');
  });

  it('fails for non-object input', () => {
    const result = parseNosqlDbSpecObject('not an object', validate);
    expect(result.ok).toBe(false);
  });
});
