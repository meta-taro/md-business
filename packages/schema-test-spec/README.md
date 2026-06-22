# @md-business/schema-test-spec

JSON Schema for test verification sheets (検証シート) — frontmatter declares column types / enum values / visual styles to drive Google Sheets DataValidation, ConditionalFormat, and DateValidation. Markdown-first authoring with bidirectional Sheets ⇄ md sync via the Google Workspace Add-on.

## Frontmatter shape

Required fields:

| Field            | Type                                                              | Notes                                                                              |
|------------------|-------------------------------------------------------------------|------------------------------------------------------------------------------------|
| `schema`         | `'test-spec/v1'`                                                  | Fixed. Note: top-level key is `schema` (not `schemaVersion`).                      |
| `documentNumber` | `string`                                                          | e.g. `TEST-2026-0001`.                                                             |
| `title`          | `string`                                                          |                                                                                    |
| `version`        | `string` (SemVer pattern)                                         | `^\d+\.\d+\.\d+$`.                                                                 |
| `issueDate`      | `string` (ISO 8601 date)                                          | `YYYY-MM-DD`.                                                                      |
| `status`         | `'draft' \| 'review' \| 'executing' \| 'completed'`               | Japanese labels normalize automatically.                                           |
| `authors`        | `Array<{name, role?}>`                                            | At least one author required.                                                      |
| `columns`        | `TestSpecColumn[]`                                                | Column schema — drives DataValidation, ConditionalFormat, SetFrozenRows on Sheets. |

Optional fields:

| Field            | Type                       | Notes                                                                              |
|------------------|----------------------------|------------------------------------------------------------------------------------|
| `reviewers`      | `Array<{name, role?}>`     | Same shape as `authors`.                                                           |
| `relatedDocs`    | `string[]`                 | Paths or URLs, passed through verbatim.                                            |
| `googleSheetId`  | `string`                   | Required when onEdit auto-sync is enabled. Bound Google Sheets file ID.            |
| `repository`     | `string`                   | GitHub binding for onEdit auto-sync. Format: `owner/repo@branch:path` (`@branch` optional, defaults to `main`). |
| `theme`          | `string`                   | Preset name (`blue`, `red`, …) or `#rrggbb`.                                       |
| `fileName`       | `string`                   | PDF filename template.                                                             |

## Column types

`columns[].type` accepts 7 values:

| Type             | Sheets enforcement                                                              |
|------------------|---------------------------------------------------------------------------------|
| `text`           | Plain string (no validation).                                                   |
| `multiline_text` | Wrap-enabled text cell (newlines preserved).                                    |
| `enum`           | DataValidation pulldown driven by `values: string[]`.                           |
| `date`           | DateValidation with `YYYY-MM-DD` format.                                        |
| `number`         | Numeric validation; optional `min` / `max` inclusive bounds.                    |
| `checkbox`       | Boolean checkbox cell.                                                          |
| `url`            | Hyperlink cell.                                                                 |

### Visual rules

`columns[].visual` maps an enum value (or `"any"` for non-enum columns) to one ConditionalFormatRule:

| Key              | Effect                                              |
|------------------|-----------------------------------------------------|
| `row_background` | Hex color applied to the **entire row**.            |
| `background`     | Hex color applied to the **single cell**.           |
| `color`          | Hex color applied to the **cell text**.             |

Hex format: `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa`.

## Japanese frontmatter

Authors write Japanese; `normalizeTestSpecFrontmatter` translates to the canonical English shape that `testSpecSchema` validates:

```yaml
---
スキーマ: test-spec/v1
文書番号: TEST-2026-0001
タイトル: ログイン機能 検証シート
版: "0.1.0"
発行日: "2026-06-18"
ステータス: 実施中
テーマ: 青
作成者:
  - 名前: 田中 雅友
    役割: PdM
シートID: 1abcDEF_replaceWithYourGoogleSheetsFileId
列定義:
  - 名前: 項目
    型: 文字列
  - 名前: 結果
    型: プルダウン
    値: [OK, NG, 保留, 未実施]
    書式:
      NG:
        行背景色: "#fce8e6"
      OK:
        文字色: "#137333"
ファイル名: "検証シート_{文書番号}_v{版}"
---
```

## Usage

### Browser / MV3 (recommended — no Ajv runtime)

```ts
import validate from '@md-business/schema-test-spec/validate';
import {
  parseTestSpecMarkdown,
  translateTestSpecErrors,
  type TestSpec,
} from '@md-business/schema-test-spec';

const result = parseTestSpecMarkdown(markdownSource, validate);
if (result.ok) {
  const testSpec: TestSpec = result.testSpec;
  // render or send to Sheets ...
} else {
  const messages = translateTestSpecErrors(result.errors); // Japanese, user-facing
}
```

### Node / tests

```ts
import { parseAndValidate } from '@md-business/core/runtime';
import { testSpecSchema, type TestSpec } from '@md-business/schema-test-spec';

const result = parseAndValidate<TestSpec>(markdownSource, testSpecSchema);
```

## API surface

| Export                          | Purpose                                                                          |
|---------------------------------|----------------------------------------------------------------------------------|
| `testSpecSchema`                | JSON Schema object (Ajv-compatible).                                             |
| `SCHEMA_VERSION`                | `'test-spec/v1'` literal constant.                                               |
| `normalizeTestSpecFrontmatter`  | Japanese → English key translation + collision warnings.                         |
| `autofillTestSpec`              | Defaults (schema / version / status / theme) + cross-checks.                     |
| `parseTestSpecMarkdown`         | End-to-end pipeline: split → normalize → autofill → validate.                    |
| `parseTestSpecObject`           | Same pipeline starting from a parsed frontmatter object (no Markdown).           |
| `renderTestSpecFileName`        | Template-driven PDF filename (`{文書番号}` / `{タイトル}` / `{版}` / `{YMD}` / …). |
| `translateTestSpecError(s)`     | Ajv error → Japanese user-facing message.                                        |
| `translateTestSpecWarning(s)`   | Normalize / autofill warning → Japanese message.                                 |
| `TEST_SPEC_JA_DICTIONARY`       | Master JP ⇄ EN dictionary (frontmatter keys + values).                           |
| `STATUS_TRANSLATIONS`           | `'draft' \| 'review' \| 'executing' \| 'completed'` ⇄ 日本語ラベル.              |
| `COLUMN_TYPE_TRANSLATIONS`      | 7 column types ⇄ 日本語ラベル (`文字列` / `プルダウン` / …).                       |
| `THEME_VALUE_TRANSLATIONS`      | Color preset name ⇄ 日本語名 (`青` / `赤` / …).                                  |

## Sample template

See [`templates/test-spec/standard-ja.md`](../../templates/test-spec/standard-ja.md) for a Japanese verification sheet covering login feature tests with 7 columns and conditional formatting.

## Spec reference

[`docs/spec/test-spec-v1.md`](../../docs/spec/test-spec-v1.md)
