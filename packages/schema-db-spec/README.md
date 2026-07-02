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

## Exports

| Entry point       | Contents                                             |
|-------------------|------------------------------------------------------|
| `.`               | `dbSpecSchema`, `SCHEMA_VERSION`, TypeScript types   |
| `./schema`        | Schema object only                                   |
| `./validate`      | Precompiled standalone Ajv validator (CSP-safe, zero runtime imports) |
| `./schema.json`   | Raw JSON Schema file                                 |
