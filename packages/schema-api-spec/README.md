# @md-business/schema-api-spec

JSON Schema for API design documents (API 詳細設計書) — frontmatter declares endpoints / request & response fields / auth / error catalog for REST, RPC, and GraphQL APIs. Markdown-first authoring with `dbRef` cross-references into `schema-db-spec`.

## Frontmatter shape

Required fields:

| Field            | Type                                                       | Notes                                          |
|------------------|------------------------------------------------------------|------------------------------------------------|
| `schema`         | `'api-spec/v1'`                                            | Fixed.                                         |
| `documentNumber` | `string`                                                   | e.g. `API-2026-0001`.                          |
| `title`          | `string`                                                   |                                                |
| `version`        | `string` (SemVer pattern)                                  | `^\d+\.\d+\.\d+$`.                             |
| `issueDate`      | `string` (ISO 8601 date)                                   | `YYYY-MM-DD`.                                  |
| `status`         | `'draft' \| 'review' \| 'approved' \| 'deprecated'`       |                                                |
| `protocol`       | `'rest' \| 'rpc' \| 'graphql'`                            | Fixed enum — new protocols via version bump.   |
| `auth`           | `'none' \| 'bearer' \| 'apiKey' \| 'oauth2' \| 'basic'`   | Document-level default auth scheme.            |
| `authors`        | `Array<{name, role?}>`                                     | At least one author required.                  |
| `endpoints`      | `ApiSpecEndpoint[]`                                        | At least one endpoint required.                |

Optional fields: `baseUrl`, `reviewers`, `relatedDocs`, `errors` (error catalog referenced by `responses[].errorRef`), `theme`, `fileName`.

## Endpoint shape

```yaml
endpoints:
  - operationId: createOrder
    method: POST
    path: /orders
    summary: 注文を作成する
    tags: [orders]
    auth: bearer
    request:
      queryParams: [{ name: dryRun, type: boolean, required: false }]
      body:
        contentType: application/json
        fields:
          - { name: customerId, type: string, required: true }
          - name: items
            type: array
            required: true
            of:
              - { name: sku,      type: string }
              - { name: quantity, type: integer }
    responses:
      - status: 201
        description: 作成された注文
        body:
          contentType: application/json
          fields:
            - { name: orderId, type: string, dbRef: "DB-2026-001#orders.order_id" }
      - status: 409
        errorRef: OUT_OF_STOCK
errors:
  - { code: OUT_OF_STOCK, httpStatus: 409, message: 在庫が不足しています }
```

- `fields[].type`: `string | integer | number | boolean | array | object | date | datetime`
- `fields[].of`: one level of nesting for `array` / `object` element shapes (each element is itself a field)
- `fields[].dbRef`: `<documentNumber>#<table>.<column>` — cross-reference into a `db-spec/v1` document, so an API field's backing column is traceable
- `responses[].status`: integer 100–599
- `responses[].errorRef`: a `code` declared in the top-level `errors[]` catalog

## Japanese frontmatter

Authors write Japanese; `normalizeApiSpecFrontmatter` translates to the canonical English shape that `apiSpecSchema` validates. Enum values are translated too (`REST` → `rest`, `Bearer` → `bearer`, `整数` → `integer`, `get` → `GET`); `dbRef` values pass through verbatim.

```yaml
---
スキーマ: api-spec/v1
文書番号: API-2026-0001
タイトル: 受発注サブシステム API 詳細設計書
版: "0.3.0"
発行日: "2026-07-15"
ステータス: レビュー中
プロトコル: REST
認証: Bearer
作成者:
  - 名前: 田中 正智
    役割: API 設計担当
エンドポイント:
  - オペレーションID: listOrders
    メソッド: get
    パス: /orders
    レスポンス:
      - ステータス: 200
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - { 名前: orderId, 型: 文字列, DB参照: "DB-2026-001#orders.order_id" }
---
```

A ready-to-copy template lives at [`templates/api-spec/standard-ja.md`](../../templates/api-spec/standard-ja.md).

## Usage

### Browser / MV3 (recommended — no Ajv runtime)

```ts
import validate from '@md-business/schema-api-spec/validate';
import {
  parseApiSpecMarkdown,
  translateApiSpecErrors,
  type ApiSpec,
} from '@md-business/schema-api-spec';

const result = parseApiSpecMarkdown(markdownSource, validate);
if (result.ok) {
  const apiSpec: ApiSpec = result.apiSpec;
  // render or export to PDF ...
} else {
  const messages = translateApiSpecErrors(result.errors); // Japanese, user-facing
}
```

### Node / tests

```ts
import { parseAndValidate } from '@md-business/core/runtime';
import { apiSpecSchema, type ApiSpec } from '@md-business/schema-api-spec';

const result = parseAndValidate<ApiSpec>(markdownSource, apiSpecSchema);
```

## API surface

| Export                         | Purpose                                                                          |
|--------------------------------|----------------------------------------------------------------------------------|
| `apiSpecSchema`                | JSON Schema object (Ajv-compatible).                                             |
| `SCHEMA_VERSION`               | `'api-spec/v1'` literal constant.                                               |
| `normalizeApiSpecFrontmatter`  | Japanese → English key + enum translation + collision warnings.                 |
| `autofillApiSpec`              | Defaults (schema / version / status / protocol / auth) + design-consistency warnings (duplicate operationId / route / response status, dangling errorRef). |
| `parseApiSpecMarkdown`         | End-to-end pipeline: split → normalize → autofill → validate.                    |
| `parseApiSpecObject`           | Same pipeline starting from a parsed frontmatter object (no Markdown).           |
| `renderApiSpecFileName`        | Template-driven PDF filename (`{文書番号}` / `{タイトル}` / `{版}` / `{プロトコル}` / `{YMD}` / …). Default: `API設計書_{文書番号}_v{版}`. |
| `translateApiSpecError(s)`     | Ajv error → Japanese user-facing message (compositional path labels).           |
| `translateApiSpecWarning(s)`   | Normalize / autofill warning → Japanese message.                                 |
| `API_SPEC_JA_DICTIONARY`       | Master JP ⇄ EN dictionary (frontmatter keys, 8 scopes).                          |
| `STATUS_TRANSLATIONS`          | `'draft' \| 'review' \| 'approved' \| 'deprecated'` ⇄ 日本語ラベル.             |
| `PROTOCOL_TRANSLATIONS`        | Protocol spelling variants (`REST` / `gRPC` / `GraphQL`) → canonical enum.       |
| `AUTH_TRANSLATIONS`            | Auth scheme variants (`Bearer` / `APIキー` / `OAuth 2.0` / …) → canonical enum.  |
| `METHOD_TRANSLATIONS`          | HTTP method case-folding (`get` → `GET`).                                        |
| `FIELD_TYPE_TRANSLATIONS`      | Field type variants (`文字列` / `整数` / …) → canonical enum.                    |
| `THEME_VALUE_TRANSLATIONS`     | Color preset name ⇄ 日本語名 (`青` / `赤` / …).                                  |

## Exports

| Entry point       | Contents                                                                |
|-------------------|-------------------------------------------------------------------------|
| `.`               | Schema, types, normalize / autofill / parse / fileName / translateError |
| `./schema`        | Schema object only                                                       |
| `./validate`      | Precompiled standalone Ajv validator (CSP-safe, zero runtime imports)    |
| `./schema.json`   | Raw JSON Schema file                                                     |

## Cross-referencing db-spec

`dbRef` ties an API field to the column that persists it: `"DB-2026-001#orders.order_id"` points at column `order_id` of table `orders` in the db-spec document numbered `DB-2026-001`. The value is stored verbatim (never rewritten by the normalize layer) so a reviewer can follow the reference from the API design straight into the DB design.

## Data cell convention

Empty cells are the only canonical representation for unfilled values. Do **not** fill them with em-dash (`—`), en-dash (`–`), horizontal-bar (`―`), `N/A`, or `TBD`. See [`docs/data-cell-conventions.md`](../../docs/data-cell-conventions.md).
