# @md-business/schema-spec

JSON Schema for software design documents (基本設計書) — Markdown-first frontmatter for `documentNumber`, `title`, `version`, `issueDate`, `status`, `authors`, `reviewers`, `relatedDocs`, `chapters`, `toc`, `theme`, `fileName`.

## Frontmatter shape

Required fields:

| Field            | Type                          | Notes                                        |
|------------------|-------------------------------|----------------------------------------------|
| `schemaVersion`  | `'spec/v1'`                   | Fixed.                                       |
| `documentNumber` | `string`                      | e.g. `SPEC-2026-001`.                        |
| `title`          | `string`                      |                                              |
| `version`        | `string` (SemVer pattern)     | `^\d+\.\d+\.\d+$`.                           |
| `issueDate`      | `string` (ISO 8601 date)      | `YYYY-MM-DD`.                                |
| `status`         | `'draft' \| 'review' \| 'approved'` | Japanese labels normalize automatically. |
| `authors`        | `Array<{name, role?}>`        | At least one author required.                |

Optional fields:

| Field          | Type                       | Notes                                              |
|----------------|----------------------------|----------------------------------------------------|
| `reviewers`    | `Array<{name, role?}>`     | Same shape as `authors`.                           |
| `relatedDocs`  | `string[]`                 | Paths or URLs, passed through verbatim.            |
| `chapters`     | `string[]` (`.md` paths)   | Multi-file layout (B3). Omit / empty = single-md.  |
| `toc`          | `'auto' \| 'manual'`       | `auto` derives chapters from Markdown headings.    |
| `theme`        | `string`                   | Preset name (`blue`, `red`, …) or `#rrggbb`.       |
| `fileName`     | `string`                   | PDF filename template.                             |

## Japanese frontmatter

Authors write Japanese; `normalizeSpecFrontmatter` translates to the canonical English shape that `specSchema` validates:

```yaml
---
スキーマ: spec/v1
文書番号: SPEC-2026-001
タイトル: 注文管理サブシステム 基本設計書
版: 0.1.0
発行日: 2026-06-17
ステータス: ドラフト
作成者:
  - 名前: 田中
    役割: Tech Lead
目次: 自動
テーマ: 青
---
```

## Usage

```ts
import { parseAndValidate } from '@md-business/core/runtime';
import { specSchema, normalizeSpecFrontmatter, type Spec } from '@md-business/schema-spec';

const result = parseAndValidate<Record<string, unknown>>(markdownSource, { type: 'object' });
if (result.ok) {
  const { data, warnings } = normalizeSpecFrontmatter(result.frontmatter);
  const validated = parseAndValidate<Spec>(serializeFrontmatter(data), specSchema);
  // ...
}
```

## Sample template

See [`templates/spec/standard-ja.md`](../../templates/spec/standard-ja.md) for a multi-page Japanese design document covering 8 chapters with Mermaid diagrams.
