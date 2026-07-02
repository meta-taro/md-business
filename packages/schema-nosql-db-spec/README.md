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

## Exports

| Entry point       | Contents                                                  |
|-------------------|-----------------------------------------------------------|
| `.`               | `nosqlDbSpecSchema`, `SCHEMA_VERSION`, TypeScript types   |
| `./schema`        | Schema object only                                        |
| `./validate`      | Precompiled standalone Ajv validator (CSP-safe, zero runtime imports) |
| `./schema.json`   | Raw JSON Schema file                                      |
