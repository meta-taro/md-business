# Spec Schema v1 — 基本設計書

`schemaVersion: spec/v1` で識別される、ソフトウェア基本設計書（要件定義より下流・詳細設計より上流）向けの Markdown-first スキーマ仕様。

- JSON Schema: [`packages/schema-spec/src/spec.schema.json`](../../packages/schema-spec/src/spec.schema.json)
- TypeScript 型: [`packages/schema-spec/src/types.ts`](../../packages/schema-spec/src/types.ts)
- サンプル: [`templates/spec/standard-ja.md`](../../templates/spec/standard-ja.md)（8 章 + Mermaid 図入りの日本語フル設計書）

## トップレベルフィールド

| フィールド | 必須 | 型 | 説明 |
|---|---|---|---|
| `schemaVersion` | ✅ | `"spec/v1"` | スキーマバージョン識別子 |
| `documentNumber` | ✅ | string | 文書番号（社内識別子。例: `SPEC-2026-001`） |
| `title` | ✅ | string | 設計書タイトル |
| `version` | ✅ | string | SemVer triple（`^\d+\.\d+\.\d+$`） |
| `issueDate` | ✅ | string (date) | 発行日（ISO 8601 `YYYY-MM-DD`） |
| `status` | ✅ | `'draft' \| 'review' \| 'approved'` | 文書ステータス |
| `authors` | ✅ | `Array<{name, role?}>` | 作成者（1 名以上） |
| `reviewers` | | `Array<{name, role?}>` | レビュアー |
| `relatedDocs` | | `string[]` | 関連文書（パス / URL / 自由文字列、verbatim 通過） |
| `chapters` | | `string[]` | 章を別 `.md` に分割する場合の相対パス配列（B3 マルチファイル） |
| `toc` | | `'auto' \| 'manual'` | 目次生成方式（`auto` は見出しから自動生成） |
| `theme` | | string | アクセントカラー（プリセット名 `blue` / `red` / … または `#rrggbb`） |
| `fileName` | | string | PDF 保存ファイル名テンプレート |

## status enum

`draft`（ドラフト）/ `review`（レビュー中）/ `approved`（承認済）の 3 値のみ許容。日本語ラベル（「ドラフト」「レビュー」「承認」等）は `normalizeSpecFrontmatter` が自動で英語キーへ変換する。

## chapters / toc

| パターン | `chapters` | `toc` | 挙動 |
|---|---|---|---|
| B1: 単一 md | 省略 or `[]` | 省略 or `auto` | 本文 Markdown 見出しから章を自動抽出 |
| B3: マルチファイル | 各章の `.md` 相対パス配列 | `manual` 推奨 | 配列順に章を結合してレンダリング |

`toc: auto` は B1 / B3 どちらでも有効。`toc: manual` は `chapters` が明示されている前提で動作する。

## YAML frontmatter での注意

- 日付は YYYY-MM-DD 形式の **文字列** として扱う。クォートしないと YAML パーサが `Date` オブジェクト化するため、サンプルでは `"2026-06-17"` のように二重引用符で囲む
- `version` も二重引用符で囲む（`"0.3.0"` 等）。YAML が `0.3.0` を文字列以外として解釈する処理系はないが、安全のため統一
- `章ファイル: []` のように空配列も明示可。省略時と等価

## 日本語 frontmatter（推奨）

著者は日本語キーで書ける。`normalizeSpecFrontmatter` が英語キーへ翻訳し、`specSchema` でバリデーションする：

```yaml
---
スキーマ: spec/v1
文書番号: SPEC-2026-001
タイトル: 注文管理サブシステム 基本設計書
版: "0.3.0"
発行日: "2026-06-17"
ステータス: ドラフト
作成者:
  - 名前: 田中
    役割: アーキテクト
目次: 自動
テーマ: 青
---
```

## バリデーション例

### Browser / MV3（推奨・Ajv ランタイム不要）

```ts
import validate from '@md-business/schema-spec/validate';
import { parseSpecMarkdown, translateSpecErrors, type Spec } from '@md-business/schema-spec';

const result = parseSpecMarkdown(markdownSource, validate);
if (result.ok) {
  const spec: Spec = result.spec;
  // render spec ...
} else {
  const messages = translateSpecErrors(result.errors); // 日本語ユーザー向け
}
```

### Node / tests

```ts
import { parseAndValidate } from '@md-business/core/runtime';
import { specSchema, type Spec } from '@md-business/schema-spec';

const result = parseAndValidate<Spec>(markdownSource, specSchema);
```

## 参照

- `packages/schema-spec/README.md` — API surface（`normalizeSpecFrontmatter` / `autofillSpec` / `parseSpecMarkdown` / `renderSpecFileName` / `translateSpecError`）
- `templates/spec/standard-ja.md` — 注文管理サブシステム基本設計書のフルサンプル
- [`docs/spec/invoice-v1.md`](./invoice-v1.md) — 姉妹仕様（適格請求書）
- [`docs/spec/test-spec-v1.md`](./test-spec-v1.md) — 姉妹仕様（検証シート）
