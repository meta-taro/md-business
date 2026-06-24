# Test-Spec Schema v1 — 検証シート

`schema: test-spec/v1` で識別される、ソフトウェアテスト検証シート（テスト項目書）向けの Markdown-first スキーマ仕様。frontmatter で宣言した列定義がそのまま Google Sheets の DataValidation / ConditionalFormat / SetFrozenRows に反映され、Sheets ⇄ md の双方向同期が成立する。

- JSON Schema: [`packages/schema-test-spec/src/test-spec.schema.json`](../../packages/schema-test-spec/src/test-spec.schema.json)
- TypeScript 型: [`packages/schema-test-spec/src/types.ts`](../../packages/schema-test-spec/src/types.ts)
- サンプル: [`templates/test-spec/standard-ja.md`](../../templates/test-spec/standard-ja.md)

## トップレベルフィールド

| フィールド | 必須 | 型 | 説明 |
|---|---|---|---|
| `schema` | ✅ | `"test-spec/v1"` | スキーマバージョン識別子（**他スキーマと異なり `schemaVersion` ではなく `schema`**） |
| `documentNumber` | ✅ | string | 文書番号（例: `TEST-2026-0001`） |
| `title` | ✅ | string | 検証シートタイトル |
| `version` | ✅ | string | SemVer triple（`^\d+\.\d+\.\d+$`） |
| `issueDate` | ✅ | string (date) | 発行日（ISO 8601 `YYYY-MM-DD`） |
| `status` | ✅ | `'draft' \| 'review' \| 'executing' \| 'completed'` | 検証ステータス |
| `authors` | ✅ | `Array<{name, role?}>` | 作成者（1 名以上） |
| `columns` | ✅ | `TestSpecColumn[]` | 列定義（DataValidation / ConditionalFormat の駆動源） |
| `reviewers` | | `Array<{name, role?}>` | レビュアー |
| `relatedDocs` | | `string[]` | 関連文書（パス / URL / verbatim） |
| `googleSheetId` | | string | Workspace Add-on の「GitHub に push」ボタンで Sheets ↔ md 同期する際の Google Sheets ファイル ID |
| `repository` | | string | GitHub 連動先（`owner/repo@branch:path` 形式） |
| `theme` | | string | アクセントカラー（プリセット名 または `#rrggbb`） |
| `fileName` | | string | PDF 保存ファイル名テンプレート |

## status enum（4 値）

| 値 | 日本語ラベル | 意味 |
|---|---|---|
| `draft` | ドラフト | 列定義の起草中 |
| `review` | レビュー | 担当外の確認待ち |
| `executing` | 実施中 | 検証作業を Sheets で進行中 |
| `completed` | 完了 | 全項目の結果が確定 |

`normalizeTestSpecFrontmatter` が日本語ラベル → 英語 enum 値へ自動変換する。

## 列型（ColumnType）— 7 種

`columns[].type` は以下の 7 値のみ許容：

| 型 | 日本語ラベル | Sheets での強制 |
|---|---|---|
| `text` | 文字列 | 通常テキスト（バリデーションなし） |
| `multiline_text` | 複数行 | wrap-enabled セル（改行保持） |
| `enum` | プルダウン | `values: string[]` を DataValidation のリストとして適用 |
| `date` | 日付 | DateValidation（`YYYY-MM-DD`） |
| `number` | 数値 | 数値バリデーション、`min` / `max` で inclusive 範囲指定可 |
| `checkbox` | チェックボックス | Boolean チェックボックスセル |
| `url` | URL | ハイパーリンクセル |

将来的に新型を追加する場合は `test-spec/v2` を新設して対応する。

## Visual rules（書式設定）

`columns[].visual` で、enum 値（または `"any"`）に対して 1 つの ConditionalFormatRule を紐付ける：

| キー | 効果 |
|---|---|
| `row_background` | 当該セルを含む **行全体** の背景色 |
| `background` | 当該 **セル** の背景色 |
| `color` | 当該セルの **文字色** |

色は Hex 形式（`#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`）。日本語キーは `行背景色` / `背景色` / `文字色` で書ける（自動変換）。

```yaml
列定義:
  - 名前: 結果
    型: プルダウン
    値: [OK, NG, 保留]
    書式:
      NG:
        行背景色: "#fce8e6"   # NG の行を薄い赤に
      OK:
        文字色: "#137333"     # OK の文字を緑に
```

## GitHub ⇄ Google Sheets 同期

`googleSheetId` と `repository` を指定すると、Google Workspace Add-on のサイドバーから Sheets と md ファイルを同期できる（v0.7.1 から手動 push 方式に統一）：

```yaml
シートID: 1abcDEF_replaceWithYourGoogleSheetsFileId
リポジトリ: meta-taro/md-business@main:verify/login.md
```

| 方向 | トリガ | 動作 |
|---|---|---|
| md → Sheets | Add-on サイドバーで「検証シート: セットアップ」 | frontmatter の `列定義` をそのまま DataValidation / ConditionalFormat / SetFrozenRows に展開 |
| Sheets → md | Add-on サイドバーで「GitHub に push」ボタン押下 | GitHub Contents API 経由で `repository` で指定された md ファイルへ commit（`git push` と同じメンタルモデル） |

`repository` の `@branch` は省略時 `main`。GitHub 認証はユーザーが PropertiesService に保存する Personal Access Token（contents: write 権限）を使用する。詳細は `apps/google-workspace-addon/` 配下を参照。

## YAML frontmatter での注意

- 日付は YYYY-MM-DD 形式の **文字列** として扱う（`"2026-06-18"` と二重引用符で囲む）
- `version` も二重引用符で囲む（`"0.1.0"` 等）
- `values:` 配列は YAML フロースタイル `[OK, NG, 保留, 未実施]` でもブロックスタイルでも可
- `googleSheetId` は Google Sheets URL の `/d/{id}/edit` の `id` 部分のみ抜き出して指定

## バリデーション例

### Browser / MV3（推奨・Ajv ランタイム不要）

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
  // render or hand off to Sheets ...
} else {
  const messages = translateTestSpecErrors(result.errors); // 日本語ユーザー向け
}
```

### Node / tests

```ts
import { parseAndValidate } from '@md-business/core/runtime';
import { testSpecSchema, type TestSpec } from '@md-business/schema-test-spec';

const result = parseAndValidate<TestSpec>(markdownSource, testSpecSchema);
```

## 参照

- `packages/schema-test-spec/README.md` — API surface（`normalizeTestSpecFrontmatter` / `autofillTestSpec` / `parseTestSpecMarkdown` / `renderTestSpecFileName` / `translateTestSpecError`）
- `templates/test-spec/standard-ja.md` — ログイン機能検証シートのフルサンプル
- [`docs/spec/spec-v1.md`](./spec-v1.md) — 姉妹仕様（基本設計書）
- [`docs/spec/invoice-v1.md`](./invoice-v1.md) — 姉妹仕様（適格請求書）
