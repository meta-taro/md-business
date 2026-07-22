# @md-business/schema-db-spec

JSON Schema for RDB design documents (DB 設計書) — frontmatter declares tables / columns / constraints / indexes / foreign keys / migration history. Markdown-first authoring with PDF export via the Chrome extension.

## Frontmatter shape

Required fields:

| Field            | Type                                                                                    | Notes                                                    |
|------------------|------------------------------------------------------------------------------------------|----------------------------------------------------------|
| `schema`         | `'db-spec/v1'`                                                                             | Fixed.                                                   |
| `documentNumber` | `string`                                                                                   | e.g. `DB-2026-001`.                                      |
| `title`          | `string`                                                                                   |                                                          |
| `version`        | `string` (SemVer pattern)                                                                  | `^\d+\.\d+\.\d+$`.                                       |
| `issueDate`      | `string` (ISO 8601 date)                                                                   | `YYYY-MM-DD`.                                            |
| `status`         | `'draft' \| 'review' \| 'approved' \| 'deprecated'`                                        |                                                          |
| `engine`         | `'postgres' \| 'mysql' \| 'aurora' \| 'sqlite' \| 'neon' \| 'supabase' \| 'turso' \| 'cloudsql'` | Fixed enum — missing engines are added via version bump. |
| `authors`        | `Array<{name, role?}>`                                                                     | At least one author required.                            |
| `tables`         | `DbSpecTable[]`                                                                            | At least one table required.                             |

Optional fields: `charset`, `collation`, `reviewers`, `relatedDocs`, `migrations` (reference list of migration IDs — real SQL lives in the repo's migrations directory), `theme`, `fileName`.

## Table shape

```yaml
tables:
  - name: users
    description: 利用者マスター
    columns:
      - { name: id,        type: bigserial,    pk: true }
      - { name: email,     type: varchar(255), nullable: false, unique: true }
      - { name: tenant_id, type: bigint,       nullable: false, fk: { table: tenants, column: id, onDelete: restrict } }
    indexes:
      - { name: ix_users_tenant_email, columns: [tenant_id, email], unique: true }
    triggers:
      - { name: trg_users_updated_at, on: "BEFORE UPDATE", action: "set updated_at = now()" }
```

- `columns[].type` is the engine-native type expression, verbatim (strict notation — synonym absorption happens in the normalize layer, not in the schema)
- `fk.onDelete` / `fk.onUpdate`: `cascade | restrict | set_null | no_action`
- `indexes[].using`: `btree | gin | gist | hash | brin` (Postgres access methods; other engines ignore unsupported values)

## Japanese frontmatter

Authors write Japanese; `normalizeDbSpecFrontmatter` translates to the canonical English shape that `dbSpecSchema` validates:

```yaml
---
スキーマ: db-spec/v1
文書番号: DB-2026-001
タイトル: 受発注ワークフロー DB 設計
版: "1.0.0"
発行日: "2026-06-26"
ステータス: 承認済
エンジン: PostgreSQL
作成者:
  - 名前: 伊藤 太郎
    役割: PdM
テーブル:
  - 名前: users
    説明: 利用者マスター
    列:
      - { 名前: id,    型: bigserial, 主キー: true }
      - { 名前: email, 型: varchar(255), NULL許可: false, 一意: true }
    インデックス:
      - { 名前: ix_users_email, 列: [email], 一意: true }
---
```

Key translation only — `columns[].type` values pass through verbatim (engine-native SQL), so `型: bigserial` and `型: varchar(255)` are never rewritten.

## Usage

### Browser / MV3 (recommended — no Ajv runtime)

```ts
import validate from '@md-business/schema-db-spec/validate';
import {
  parseDbSpecMarkdown,
  translateDbSpecErrors,
  type DbSpec,
} from '@md-business/schema-db-spec';

const result = parseDbSpecMarkdown(markdownSource, validate);
if (result.ok) {
  const dbSpec: DbSpec = result.dbSpec;
  // render or export to PDF ...
} else {
  const messages = translateDbSpecErrors(result.errors); // Japanese, user-facing
}
```

### Node / tests

```ts
import { parseAndValidate } from '@md-business/core/runtime';
import { dbSpecSchema, type DbSpec } from '@md-business/schema-db-spec';

const result = parseAndValidate<DbSpec>(markdownSource, dbSpecSchema);
```

## API surface

| Export                        | Purpose                                                                          |
|-------------------------------|----------------------------------------------------------------------------------|
| `dbSpecSchema`                | JSON Schema object (Ajv-compatible).                                             |
| `SCHEMA_VERSION`              | `'db-spec/v1'` literal constant.                                                 |
| `normalizeDbSpecFrontmatter`  | Japanese → English key translation + collision warnings.                         |
| `autofillDbSpec`              | Defaults (schema / version / status) + design-consistency warnings (duplicate table/column names, pk+nullable, dangling index/fk references). |
| `parseDbSpecMarkdown`         | End-to-end pipeline: split → normalize → autofill → validate.                    |
| `parseDbSpecObject`           | Same pipeline starting from a parsed frontmatter object (no Markdown).           |
| `renderDbSpecFileName`        | Template-driven PDF filename (`{文書番号}` / `{タイトル}` / `{版}` / `{エンジン}` / `{YMD}` / …). Default: `DB設計書_{文書番号}_v{版}`. |
| `translateDbSpecError(s)`     | Ajv error → Japanese user-facing message.                                        |
| `translateDbSpecWarning(s)`   | Normalize / autofill warning → Japanese message.                                 |
| `DB_SPEC_JA_DICTIONARY`       | Master JP ⇄ EN dictionary (frontmatter keys, 8 scopes).                          |
| `STATUS_TRANSLATIONS`         | `'draft' \| 'review' \| 'approved' \| 'deprecated'` ⇄ 日本語ラベル.              |
| `ENGINE_TRANSLATIONS`         | Engine spelling variants (`PostgreSQL` / `Postgres` / …) → canonical enum.       |
| `THEME_VALUE_TRANSLATIONS`    | Color preset name ⇄ 日本語名 (`青` / `赤` / …).                                  |

## Exports

| Entry point       | Contents                                             |
|-------------------|------------------------------------------------------|
| `.`               | Schema, types, normalize / autofill / parse / fileName / translateError |
| `./schema`        | Schema object only                                   |
| `./validate`      | Precompiled standalone Ajv validator (CSP-safe, zero runtime imports) |
| `./schema.json`   | Raw JSON Schema file                                 |

## Data cell convention

Empty cells are the only canonical representation for unfilled values. Do **not** fill them with em-dash (`—`), en-dash (`–`), horizontal-bar (`―`), `N/A`, or `TBD`. See [`docs/data-cell-conventions.md`](../../docs/data-cell-conventions.md).
