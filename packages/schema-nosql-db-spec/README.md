# @md-business/schema-nosql-db-spec

JSON Schema for NoSQL design documents (NoSQL 設計書) — frontmatter declares collections / document shapes / docIdStrategy / secondary indexes / TTL / security rules. Markdown-first authoring with PDF export via the Chrome extension.

## Frontmatter shape

Required fields:

| Field            | Type                                                                                              | Notes                                  |
|------------------|---------------------------------------------------------------------------------------------------|----------------------------------------|
| `schema`         | `'nosql-db-spec/v1'`                                                                                | Fixed.                                 |
| `documentNumber` | `string`                                                                                            | e.g. `NOSQL-2026-001`.                 |
| `title`          | `string`                                                                                            |                                        |
| `version`        | `string` (SemVer pattern)                                                                           | `^\d+\.\d+\.\d+$`.                     |
| `issueDate`      | `string` (ISO 8601 date)                                                                            | `YYYY-MM-DD`.                          |
| `status`         | `'draft' \| 'review' \| 'approved' \| 'deprecated'`                                                 |                                        |
| `engine`         | `'firestore' \| 'dynamodb' \| 'mongodb' \| 'cosmosdb' \| 'redis' \| 'documentdb' \| 'turso-document'` | Fixed enum.                            |
| `authors`        | `Array<{name, role?}>`                                                                              | At least one author required.          |
| `collections`    | `NosqlCollection[]`                                                                                 | At least one collection required.      |

Optional fields: `multiRegion`, `reviewers`, `relatedDocs`, `securityRules`, `theme`, `fileName`.

## Collection shape

```yaml
collections:
  - path: users/{userId}/orders          # Firestore-style {placeholder} is canonical
    docIdStrategy: auto                  # uuid | auto | auth-uid | composite
    shape:
      total:    { type: number, required: true }
      currency: { type: string, required: true, enum: [JPY, USD, EUR] }
      items:
        type: array
        of:                              # array element definition (recursive)
          type: map
          shape:                         # nested field map (recursive)
            sku:      { type: string, required: true }
            quantity: { type: number, required: true }
    indexes:
      - { fields: [createdAt], scope: collection, mode: DESCENDING }
    ttl: { field: expiresAt, enabled: false }

securityRules:
  - { match: "/users/{userId}", allow: [read, write], if: "request.auth.uid == userId" }
```

- `docIdStrategy` abstracts engine-specific document IDs. `composite` (DynamoDB style) requires `partitionKeyField` as a sibling; `sortKeyField` is optional
- `shape` field types: `string | number | boolean | timestamp | map | array | reference | geopoint | bytes | null`. `type: array` requires `of`, `type: map` requires `shape` — nesting is expressed by recursion
- `engineSpecific` on a collection is a free-form escape hatch for settings the common schema does not cover (e.g. DynamoDB `billingMode`)

## Japanese frontmatter

Authors write Japanese; `normalizeNosqlDbSpecFrontmatter` translates to the canonical English shape that `nosqlDbSpecSchema` validates:

```yaml
---
スキーマ: nosql-db-spec/v1
文書番号: NDB-2026-001
タイトル: ユーザーストア設計
版: "1.0.0"
発行日: "2026-07-02"
ステータス: 承認済
エンジン: Firestore
作成者:
  - 名前: 伊藤 太郎
    役割: PdM
コレクション:
  - パス: users/{userId}
    ドキュメントID戦略: 認証UID
    形状:
      表示名: { 型: 文字列, 必須: true }
      タグ:
        型: 配列
        要素: { 型: 文字列 }
    インデックス:
      - { フィールド: [表示名], スコープ: コレクショングループ, モード: 降順 }
セキュリティルール:
  - { 対象: "/users/{userId}", 許可: [読み取り, 更新], 条件: "request.auth.uid == userId" }
---
```

Translation boundaries:

- `shape` field **names** are user data and stay verbatim (`表示名` above remains `表示名`); only the field definition behind each name is translated
- field **type values** ARE translated (`型: 文字列` → `type: string`) — the NoSQL type enum is engine-agnostic, unlike RDB column types which pass through verbatim
- `path` values keep `{placeholder}` notation verbatim
- `engineSpecific` passes through completely untranslated (escape hatch)

## Usage

### Browser / MV3 (recommended — no Ajv runtime)

```ts
import validate from '@md-business/schema-nosql-db-spec/validate';
import {
  parseNosqlDbSpecMarkdown,
  translateNosqlDbSpecErrors,
  type NosqlDbSpec,
} from '@md-business/schema-nosql-db-spec';

const result = parseNosqlDbSpecMarkdown(markdownSource, validate);
if (result.ok) {
  const nosqlDbSpec: NosqlDbSpec = result.nosqlDbSpec;
  // render or export to PDF ...
} else {
  const messages = translateNosqlDbSpecErrors(result.errors); // Japanese, user-facing
}
```

### Node / tests

```ts
import { parseAndValidate } from '@md-business/core/runtime';
import { nosqlDbSpecSchema, type NosqlDbSpec } from '@md-business/schema-nosql-db-spec';

const result = parseAndValidate<NosqlDbSpec>(markdownSource, nosqlDbSpecSchema);
```

## API surface

| Export                              | Purpose                                                                          |
|-------------------------------------|----------------------------------------------------------------------------------|
| `nosqlDbSpecSchema`                 | JSON Schema object (Ajv-compatible).                                             |
| `SCHEMA_VERSION`                    | `'nosql-db-spec/v1'` literal constant.                                           |
| `normalizeNosqlDbSpecFrontmatter`   | Japanese → English key translation + collision warnings.                         |
| `autofillNosqlDbSpec`               | Defaults (schema / version / status) + design-consistency warnings (duplicate paths, composite key / ttl / index references not declared in shape). |
| `parseNosqlDbSpecMarkdown`          | End-to-end pipeline: split → normalize → autofill → validate.                    |
| `parseNosqlDbSpecObject`            | Same pipeline starting from a parsed frontmatter object (no Markdown).           |
| `renderNosqlDbSpecFileName`         | Template-driven PDF filename (`{文書番号}` / `{タイトル}` / `{版}` / `{エンジン}` / `{YMD}` / …). Default: `NoSQL設計書_{文書番号}_v{版}`. |
| `translateNosqlDbSpecError(s)`      | Ajv error → Japanese user-facing message (dynamic `shape` field names re-injected into labels). |
| `translateNosqlDbSpecWarning(s)`    | Normalize / autofill warning → Japanese message.                                 |
| `NOSQL_DB_SPEC_JA_DICTIONARY`       | Master JP ⇄ EN dictionary (frontmatter keys, 7 scopes).                          |
| `STATUS_TRANSLATIONS`               | `'draft' \| 'review' \| 'approved' \| 'deprecated'` ⇄ 日本語ラベル.              |
| `ENGINE_TRANSLATIONS`               | Engine spelling variants (`Firestore` / `Cosmos DB` / …) → canonical enum.       |
| `FIELD_TYPE_TRANSLATIONS`           | Field type vocabulary (`文字列` / `配列` / …) → canonical enum.                  |
| `THEME_VALUE_TRANSLATIONS`          | Color preset name ⇄ 日本語名 (`青` / `赤` / …).                                  |

## Exports

| Entry point       | Contents                                                  |
|-------------------|-----------------------------------------------------------|
| `.`               | Schema, types, normalize / autofill / parse / fileName / translateError |
| `./schema`        | Schema object only                                        |
| `./validate`      | Precompiled standalone Ajv validator (CSP-safe, zero runtime imports) |
| `./schema.json`   | Raw JSON Schema file                                      |

## Data cell convention

Empty cells are the only canonical representation for unfilled values. Do **not** fill them with em-dash (`—`), en-dash (`–`), horizontal-bar (`―`), `N/A`, or `TBD`. See [`docs/data-cell-conventions.md`](../../docs/data-cell-conventions.md).
