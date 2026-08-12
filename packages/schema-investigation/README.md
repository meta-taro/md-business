# @md-business/schema-investigation

JSON Schema for investigation reports (調査報告書). One schema covers both log and network investigations — `kind` says which data source was read; the shape of an investigation is the same either way.

The design goal is that a report cannot be written without stating **what was read, with what, and when** — and that no finding can be written without pointing at the Evidence it came from.

## Frontmatter shape

Required fields:

| Field            | Type                                                    | Notes                                                        |
|------------------|---------------------------------------------------------|--------------------------------------------------------------|
| `schema`         | `'investigation/v1'`                                    | Fixed.                                                        |
| `kind`           | `'log' \| 'network'`                                    | Which data source was read. Never defaulted — see below.     |
| `documentNumber` | `string`                                                | e.g. `INV-2026-0001`.                                        |
| `title`          | `string`                                                |                                                              |
| `createdAt`      | `string` (ISO 8601 date-time)                           | e.g. `2026-08-12T09:30:00+09:00`.                            |
| `status`         | `'investigating' \| 'concluded' \| 'suspended'`         | Defaults to `investigating`.                                  |
| `authors`        | `Array<{name, role?}>`                                  | At least one.                                                 |
| `targets`        | `Array<{path, sha256, note?}>`                          | At least one. `sha256` is `^[0-9a-f]{64}$`.                  |
| `tools`          | `Array<{name, version}>`                                | At least one. Version is required, not optional.              |
| `window`         | `{from, to}` (ISO 8601 date-time)                       | The time range the investigation covers.                      |

Optional fields: `reviewers`, `findings`, `summary`, `relatedDocs`, `theme`, `fileName`.

## Provenance is required, not advisory

- **`targets[].sha256`** — the only way to confirm later that the file examined is the same file. If the file is re-fetched, the hash is re-taken.
- **`tools[].version`** — a tool's output changes between versions, so the version is what makes the same steps reproducible.
- **`window`** — an investigation that does not state its time range cannot be compared against another one.
- **`kind` is never defaulted.** Which data source was read is a fact about the investigation, not a preference; guessing it would put an unchecked claim into the record. `autofillInvestigation` fills `schema` and `status` and deliberately leaves `kind` empty so validation asks the author for it.

## Findings must cite Evidence

```yaml
findings:
  - id: F-01
    summary: 05:10 台の 1 分間に認証失敗が 12 件集中している
    severity: high
    evidence:
      - evidence/EV-001.md
```

- `findings` itself is optional — an investigation still in progress legitimately has none yet.
- Every finding that *does* exist requires at least one `evidence` entry matching `^evidence/EV-\d{3,}\.md$` — the exact shape of the `reference` that the `save_evidence` MCP tool returns.
- Prose in the `evidence` field (`ログを見た感じ`) fails validation. The pattern is what makes 「根拠なしで書かせない」 mechanical rather than a convention people remember to follow.
- `id` is `^F-\d{2,}$`; `severity` is `high | medium | low | info`.

## Autofill warnings (non-blocking)

- `status: concluded` with zero findings — a concluded investigation with nothing found is more often an unfinished one.
- `window.from` later than `window.to`.

Warnings never block validation; only the schema does.

## Japanese frontmatter

Authors write Japanese; `normalizeInvestigationFrontmatter` translates to the canonical English shape that `investigationSchema` validates. Enum values are translated too (`ログ` → `log`, `調査中` → `investigating`, `高` → `high`, `青` → `blue`).

```yaml
---
スキーマ: investigation/v1
種別: ログ
文書番号: INV-2026-0001
タイトル: 深夜帯のログイン失敗急増の調査
作成日時: "2026-08-12T09:30:00+09:00"
状態: 調査中
作成者:
  - 名前: 山田 太郎
    役割: 調査担当
対象ファイル:
  - パス: logs/app-2026-08-11.jsonl
    ハッシュ: 3b1f0c6a9d4e2f8b7c5a1d0e6f4b2a9c8d7e5f3a1b0c9d8e7f6a5b4c3d2e1f00
使用ツール:
  - 名前: md-business mcp-server
    版: "0.9.0"
調査時間帯:
  開始: "2026-08-11T00:00:00+09:00"
  終了: "2026-08-12T00:00:00+09:00"
所見:
  - 番号: F-01
    要約: 05:10 台の 1 分間に認証失敗が 12 件集中している
    深刻度: 高
    根拠:
      - evidence/EV-001.md
---
```

A ready-to-copy template lives at [`templates/investigation/standard-ja.md`](../../templates/investigation/standard-ja.md).

## Usage

### Browser / MV3 (recommended — no Ajv runtime)

```ts
import validate from '@md-business/schema-investigation/validate';
import {
  parseInvestigationMarkdown,
  translateInvestigationErrors,
  type Investigation,
} from '@md-business/schema-investigation';

const result = parseInvestigationMarkdown(markdownSource, validate);
if (result.ok) {
  const investigation: Investigation = result.investigation;
} else {
  const messages = translateInvestigationErrors(result.errors); // Japanese, user-facing
}
```

### Node / tests

```ts
import { parseAndValidate } from '@md-business/core/runtime';
import { investigationSchema, type Investigation } from '@md-business/schema-investigation';

const result = parseAndValidate<Investigation>(markdownSource, investigationSchema);
```

## API surface

| Export                              | Purpose                                                                                   |
|-------------------------------------|-------------------------------------------------------------------------------------------|
| `investigationSchema`               | JSON Schema object (Ajv-compatible).                                                      |
| `SCHEMA_VERSION`                    | `'investigation/v1'` literal constant.                                                    |
| `normalizeInvestigationFrontmatter` | Japanese → English key + enum translation + collision warnings.                            |
| `autofillInvestigation`             | Defaults (`schema` / `status`) + consistency warnings (concluded-without-findings, reversed window). |
| `parseInvestigationMarkdown`        | End-to-end pipeline: split → normalize → autofill → validate.                              |
| `parseInvestigationObject`          | Same pipeline starting from a parsed frontmatter object (no Markdown).                      |
| `renderInvestigationFileName`       | Template-driven PDF filename (`{文書番号}` / `{タイトル}` / `{種別}` / `{作成日YMD}` / …). Default: `調査報告書_{文書番号}`. |
| `translateInvestigationError(s)`    | Ajv error → Japanese user-facing message (compositional path labels).                      |
| `translateInvestigationWarning(s)`  | Normalize / autofill warning → Japanese message.                                            |
| `INVESTIGATION_JA_DICTIONARY`       | Master JP ⇄ EN dictionary (frontmatter keys, 6 scopes).                                    |
| `KIND_TRANSLATIONS`                 | `ログ` / `ネットワーク` / `通信` → canonical enum.                                          |
| `STATUS_TRANSLATIONS`               | `調査中` / `完了` / `保留` → canonical enum.                                                |
| `SEVERITY_TRANSLATIONS`             | `高` / `中` / `低` / `情報` → canonical enum.                                               |
| `THEME_VALUE_TRANSLATIONS`          | Color preset name ⇄ 日本語名 (`青` / `赤` / …).                                            |

## Exports

| Entry point       | Contents                                                                |
|-------------------|-------------------------------------------------------------------------|
| `.`               | Schema, types, normalize / autofill / parse / fileName / translateError |
| `./schema`        | Schema object only                                                       |
| `./validate`      | Precompiled standalone Ajv validator (CSP-safe, zero runtime imports)    |
| `./schema.json`   | Raw JSON Schema file                                                     |

## Data cell convention

Empty cells are the only canonical representation for unfilled values. Do **not** fill them with em-dash (`—`), en-dash (`–`), horizontal-bar (`―`), `N/A`, or `TBD`. See [`docs/data-cell-conventions.md`](../../docs/data-cell-conventions.md).
