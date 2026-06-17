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

### Browser / MV3 (recommended — no Ajv runtime)

```ts
import validate from '@md-business/schema-spec/validate';
import { parseSpecMarkdown, translateSpecErrors, type Spec } from '@md-business/schema-spec';

const result = parseSpecMarkdown(markdownSource, validate);
if (result.ok) {
  const spec: Spec = result.spec;
  // render spec ...
} else {
  const messages = translateSpecErrors(result.errors); // Japanese, user-facing
}
```

### Node / tests

```ts
import { parseAndValidate } from '@md-business/core/runtime';
import { specSchema, type Spec } from '@md-business/schema-spec';

const result = parseAndValidate<Spec>(markdownSource, specSchema);
```

## API surface

| Export                  | Purpose                                                       |
|-------------------------|---------------------------------------------------------------|
| `specSchema`            | JSON Schema object (Ajv-compatible).                          |
| `normalizeSpecFrontmatter` | Japanese → English key translation + collision warnings.   |
| `autofillSpec`          | Defaults (schemaVersion / version / status / toc) + cross-checks. |
| `parseSpecMarkdown`     | End-to-end pipeline: split → normalize → autofill → validate. |
| `renderSpecFileName`    | Template-driven PDF filename (`{文書番号}` / `{タイトル}` / `{版}` / …). |
| `translateSpecError(s)` | Ajv error → Japanese user-facing message.                     |
| `translateSpecWarning(s)` | Normalize / autofill warning → Japanese message.            |

## Sample template

See [`templates/spec/standard-ja.md`](../../templates/spec/standard-ja.md) for a multi-page Japanese design document covering 8 chapters with Mermaid diagrams.
