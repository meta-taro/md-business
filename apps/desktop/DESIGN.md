# md-business Desktop — DESIGN.md

> **本命プロダクトのデザイン正本**（baseline §11 / [[decisions.md]] 2026-07-16「デスクトップはデザイン重視で作る」）。
> UI 実装（Svelte 5 + SvelteKit）に入る前にここで**デザイン言語を固定**する。手戻り防止のため、
> 実装は本ファイルのトークン（CSS custom properties）を唯一の出典として参照する。
>
> - **トーン**: Linear 風・モダン SaaS（洗練・上質・余白広め・繊細なアクセント・丁寧なマイクロインタラクション）
> - **フロント**: Svelte 5 + SvelteKit（`adapter-static` / SSR off・Tauri 静的アセット）
> - **テーマ**: 両対応（**ライト主軸**設計・ダーク同等パリティ）
> - **関連**: `.claude/issues/004-v1.0-tauri-desktop-mcp-accounting-mvp.md` E 章（3 ペイン UI）

---

## 1. デザイン原則（Linear 風の核）

1. **静けさ優先（quiet by default）**: 装飾は最小。色・影・境界線は「必要なとき最小限」。情報が主役、クロームは背景に退く。
2. **余白で階層を作る**: 罫線を増やすより余白で区切る。密度は高すぎず、業務文書の可読性を最優先。
3. **繊細なアクセント**: シグネチャの indigo は「操作可能な一点」にだけ使う。多用しない。
4. **速いフィードバック**: 120–160ms の ease-out。ホバー・フォーカス・選択は即座に、しかし穏やかに反応。
5. **キーボードファースト**: `⌘K` コマンドパレットを中心に、マウスなしで主要操作が完結する。
6. **6 スキーマの統一言語**: invoice / spec / test-spec / db-spec / nosql-db-spec / api-spec を**同一のクローム**で一覧・編集・プレビュー。スキーマ差はアクセント色付きラベル/アイコンだけで表現し、枠組みは共通。

---

## 2. カラートークン

Linear は「ほぼ無彩色のニュートラル + 一点の indigo アクセント」。ライトを第一級で設計し、ダークは同じトークン名で値だけ差し替える。

### 2.1 ブランドアクセント（両テーマ共通の意味）

| トークン | ライト | ダーク | 用途 |
|---|---|---|---|
| `--accent` | `#5b5bd6` | `#7c7cf0` | 主要操作・選択・フォーカスリング・リンク |
| `--accent-hover` | `#4f4fc9` | `#8f8ff5` | ホバー時 |
| `--accent-active` | `#4444b8` | `#a0a0f7` | 押下時 |
| `--accent-subtle` | `#eeeefb` | `#1e1e3a` | 選択行背景・淡いバッジ地 |
| `--accent-border` | `#d5d5f5` | `#33335c` | 淡い枠 |
| `--accent-gradient` | `linear-gradient(135deg,#6a6ae0,#5b5bd6)` | `linear-gradient(135deg,#8f8ff5,#7c7cf0)` | 表紙・空状態・CTA の繊細なグラデ |

### 2.2 ニュートラル（背景・境界・テキスト）

**ライト（主軸）**

| トークン | 値 | 用途 |
|---|---|---|
| `--bg-app` | `#ffffff` | メインキャンバス（中央プレビュー） |
| `--bg-subtle` | `#fbfbfd` | サイドバー・右ペインなど従属面 |
| `--bg-sunken` | `#f4f4f7` | 入力の内側・コードブロック地 |
| `--bg-elevated` | `#ffffff` | カード・ポップオーバー・メニュー（+影） |
| `--bg-hover` | `#f6f6f9` | 行・アイテムのホバー |
| `--border` | `#e8e8ed` | ヘアライン境界（既定） |
| `--border-strong` | `#d4d4dc` | 強調境界・区切り |
| `--text-primary` | `#1c1c22` | 本文・見出し |
| `--text-secondary` | `#63636e` | 補助・メタ情報 |
| `--text-tertiary` | `#9b9ba5` | プレースホルダ・非活性 |
| `--text-on-accent` | `#ffffff` | アクセント地の上の文字 |

**ダーク（同等パリティ）**

| トークン | 値 |
|---|---|
| `--bg-app` | `#0f0f13` |
| `--bg-subtle` | `#141418` |
| `--bg-sunken` | `#1a1a20` |
| `--bg-elevated` | `#1b1b21` |
| `--bg-hover` | `#1f1f26` |
| `--border` | `#26262d` |
| `--border-strong` | `#34343d` |
| `--text-primary` | `#f4f4f6` |
| `--text-secondary` | `#a0a0ab` |
| `--text-tertiary` | `#6b6b76` |
| `--text-on-accent` | `#ffffff` |

### 2.3 セマンティック（status バッジ・検証結果）

6 スキーマ共通の `status`（draft / review / approved / deprecated）と検証結果に使う。renderer-pdf 側の status ラベル日本語化（ドラフト/レビュー中/承認済/非推奨）とアプリシェルの色を一致させる。

| 意味 | トークン | ライト地/文字 | ダーク地/文字 |
|---|---|---|---|
| success（承認済 / valid） | `--success` | `#e7f6ec` / `#1a7f42` | `#12291b` / `#4ade80` |
| warning（レビュー中 / 警告） | `--warning` | `#fdf3e2` / `#9a6a00` | `#2a2109` / `#f5c451` |
| neutral（ドラフト） | `--neutral` | `#f0f0f3` / `#63636e` | `#22222a` / `#a0a0ab` |
| danger（非推奨 / エラー） | `--danger` | `#fcebec` / `#b4232a` | `#2a1113` / `#f2777c` |
| info（ヒント） | `--info` | `#e9f1fd` / `#1f5fc0` | `#0f1d33` / `#6fa8f5` |

### 2.4 スキーマ別アクセント（ラベル/アイコンの色差のみ）

クロームは共通、スキーマ識別だけ色で。彩度は抑えめ（Linear 的に静か）。

| スキーマ | 色（ライト） | ラベル |
|---|---|---|
| invoice | `#c2410c`（terracotta） | 適格請求書 |
| spec | `#5b5bd6`（indigo＝基準） | 基本設計書 |
| test-spec | `#1a7f42`（green） | 検証シート |
| db-spec | `#1f5fc0`（blue） | DB 設計書 |
| nosql-db-spec | `#6d28d9`（purple） | NoSQL 設計書 |
| api-spec | `#0f766e`（teal） | API 設計書 |

> renderer-pdf の HTTP method 色分け（GET 青 / POST 緑 / PUT・PATCH 黄 / DELETE 赤 / HEAD・OPTIONS 紫）はプレビュー内の PDF レンダラ由来でそのまま活かす。アプリシェルのスキーマ色とは別レイヤー。

---

## 3. タイポグラフィ

- **UI フォント**: `Inter`（可変）→ 日本語 `Noto Sans JP`（既に fontsource で同梱済み・[[post-build.mjs]] 参照）。フォールバック `system-ui, -apple-system, "Hiragino Sans", sans-serif`。
- **等幅**: `"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace`（パス・コード・エンドポイント・型・Git diff）。
- Linear は密で小さめ。**ベース 14px**、行間はゆったり。

| トークン | size / line-height / weight | 用途 |
|---|---|---|
| `--text-2xs` | 11 / 16 / 500 | バッジ・キャプション・タブの補助数 |
| `--text-xs` | 12 / 18 / 400 | メタ情報・テーブルの副次セル |
| `--text-sm` | 13 / 20 / 400 | **UI 既定**（サイドバー・ボタン・入力） |
| `--text-base` | 14 / 22 / 400 | 本文・プレビュー既定 |
| `--text-md` | 16 / 24 / 500 | パネル見出し・カードタイトル |
| `--text-lg` | 20 / 28 / 600 | 文書タイトル |
| `--text-xl` | 24 / 32 / 600 | 表紙見出し |
| `--text-2xl` | 32 / 40 / 700 | 空状態・オンボーディング |

- **字間**: 見出し（`--text-lg` 以上）は `letter-spacing: -0.01em`（Linear 的な締まり）。等幅は `0`。
- **数字**: テーブル・金額・バージョンは `font-variant-numeric: tabular-nums`。

---

## 4. スペーシング・角丸・影・モーション

### 4.1 スペーシング（4px グリッド）

`--space-1:4px` / `--space-2:8px` / `--space-3:12px` / `--space-4:16px` / `--space-5:24px` / `--space-6:32px` / `--space-8:48px` / `--space-10:64px`。

- ペイン内パディング: `--space-4`（16）〜`--space-5`（24）。余白広め＝Linear の呼吸感。
- リストアイテム縦: `--space-2`（8）上下、行高でクリック域確保。

### 4.2 角丸

`--radius-sm:6px`（入力・バッジ） / `--radius-md:8px`（**既定**＝ボタン・カード・アイテム） / `--radius-lg:12px`（モーダル・ポップオーバー） / `--radius-full:999px`（ピル・アバター）。

### 4.3 影（低アルファ・繊細）

| トークン | ライト | 用途 |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(20,20,30,.04)` | 入力フォーカス外の微起伏 |
| `--shadow-sm` | `0 1px 3px rgba(20,20,30,.06), 0 1px 2px rgba(20,20,30,.04)` | カード |
| `--shadow-md` | `0 4px 12px rgba(20,20,30,.08), 0 2px 4px rgba(20,20,30,.04)` | ポップオーバー・メニュー |
| `--shadow-lg` | `0 12px 32px rgba(20,20,30,.14)` | モーダル・コマンドパレット |

ダークは影を弱め、代わりに `--border` で起伏を出す（`--shadow-*` のアルファを `.3〜.5` へ、境界を 1px 明示）。

### 4.4 モーション

- `--ease: cubic-bezier(0.2, 0, 0, 1)`（ease-out 寄り）。
- `--dur-fast:120ms`（ホバー・フォーカス） / `--dur-base:160ms`（選択・展開） / `--dur-slow:240ms`（パネル開閉・モーダル）。
- `prefers-reduced-motion` で全アニメーションを `1ms` に短縮（アクセシビリティ必須）。
- マイクロインタラクション例: ボタン押下 `transform: translateY(0.5px)`、行選択の左端 2px アクセントバーが `--dur-base` でフェードイン。

---

## 5. コンポーネント仕様

### 5.1 ボタン

| variant | 地 / 文字 / 枠 | 用途 |
|---|---|---|
| primary | `--accent` / `--text-on-accent` / none | 主要 CTA（Commit・保存） |
| secondary | `--bg-elevated` / `--text-primary` / `--border-strong` | 一般操作 |
| ghost | transparent / `--text-secondary` / none（hover で `--bg-hover`） | ツールバー・アイコンボタン |
| danger | `--danger` 地 / danger 文字（outline 版） | 破壊的操作（要確認） |

- 高さ: `sm 28px` / `md 32px`（既定） / `lg 36px`。角丸 `--radius-md`。パディング横 `--space-3`。
- フォーカス: `box-shadow: 0 0 0 3px var(--accent-subtle)` + `border-color: var(--accent)`。
- **Push ボタンだけは特別扱い**（§7.4）: baseline §6「push は人間」を UI で明示。

### 5.2 カード

`--bg-elevated` + `--shadow-sm` + `1px solid --border` + `--radius-md`。ヘッダ（`--text-md`）/ 本文 / フッタ。ホバーで昇格させない（静けさ優先）。選択時のみ `--accent-border`。

### 5.3 テーブル（業務文書の密な表）

- ヘアライン行区切り（`--border`）。**縦罫線なし**（余白で列を分ける）。
- ヘッダ: `--bg-subtle` 地・`--text-xs`・`--text-secondary`・`sticky top`。
- 行高 32px・ホバー `--bg-hover`。ゼブラなし（Linear は罫線最小）。
- 数値列 `tabular-nums` 右寄せ。空セルは**空のまま**（[[data-cell-conventions]]・`—`/`N/A`/`TBD` で埋めない）。
- スキーマプレビュー内の表（renderer-pdf 由来 HTML）は PDF 用 CSS を尊重しつつ、アプリシェルのテーブルはこの仕様。

### 5.4 バッジ / ピル（status）

`--radius-full` or `--radius-sm`・`--text-2xs`・大文字化しない。セマンティック地/文字（§2.3）。例: 承認済＝success、レビュー中＝warning、ドラフト＝neutral、非推奨＝danger。ドット付き（`● 承認済`）で色覚補助。

### 5.5 入力・フォーム（frontmatter 編集）

`--bg-sunken` 地 or `--bg-app` + `--border`・角丸 `--radius-sm`・高さ 32px。フォーカスで `--accent` 枠 + `--accent-subtle` リング。ラベルは `--text-xs --text-secondary`。エラーは `--danger` 枠 + 下部にメッセージ（検証エラーは日本語化済みメッセージを表示）。

### 5.6 コマンドパレット（⌘K）

中央上寄せモーダル・`--shadow-lg`・`--radius-lg`・幅 min(560px, 90vw)。検索入力 + グルーピングされた結果（文書 / コマンド / スキーマ）。キーボードナビ必須。Linear の中核 UX。

### 5.7 サイドバーアイテム（ファイルツリー）

高さ 30px・`--text-sm`・アイコン + ラベル。選択: `--accent-subtle` 地 + 左 2px `--accent` バー + `--text-primary`。ホバー `--bg-hover`。スキーマ別アイコン色（§2.4）。展開/折り畳みは `--dur-base`。

---

## 6. レイアウト（3 ペイン）

Issue 004 E 章の 3 ペイン構成を Linear 風に具体化。VS Code / Cursor / Obsidian の慣れた骨格 + Linear の静けさ。

```
┌───────────────────────────────────────────────────────────────┐
│ ● md-business        受発注 API 設計書        ⌘K    ◐  ⚙       │ ← Top bar 44px
├──────────────┬────────────────────────────┬───────────────────┤
│ File Tree    │  Markdown Preview          │  AI / Git / MCP   │
│ (240–320px)  │  (flex・min 480px)         │  (300–420px)      │
│              │                            │                   │
│ ▸ receipts/  │  [文書タイトル・status]     │  ┌─ tabs ────────┐│
│ ▸ expenses/  │  ─────────────────────     │  │ Chat│Diff│MCP ││
│ ▸ monthly/   │  (renderer-pdf HTML を      │  └───────────────┘│
│ ▸ templates/ │   Svelte 内に埋め込み)      │  AI チャット /     │
│              │  [Frontmatter | Body]       │  Git diff /       │
│              │                            │  MCP 状態 ●        │
├──────────────┴────────────────────────────┴───────────────────┤
│ Git: 2 changed   [Commit]   [Push ⚠人間]        MCP ● 接続中    │ ← Status bar 32px
└───────────────────────────────────────────────────────────────┘
```

- **Top bar 44px**: 左＝アプリ識別（●ロゴ + 名称）、中央＝現在の文書タイトル（従属・`--text-secondary`）、右＝`⌘K` / テーマ切替 `◐` / 設定 `⚙`。細く・静か。
- **ペイン境界**: 1px `--border`。ドラッグでリサイズ可能（ハンドルはホバーで `--accent` 薄表示）。各ペインに min-width。
- **中央プレビュー**: `--bg-app`。renderer-pdf の HTML 出力（`renderApiSpecBody` 等）をそのまま埋め込む。Frontmatter 編集 ⇔ Body Markdown のタブ切替。
- **右ペイン**: `--bg-subtle`。タブ（AI チャット / Git diff / MCP ログ）。MCP 接続状態インジケータ（● success / ○ neutral / ● danger）。
- **Status bar 32px**: Git 変更数・Commit・**Push（⚠人間のみ・§7.4）**・MCP 状態。

---

## 7. レスポンシブ / 状態 / アクセシビリティ / ガバナンス表現

### 7.1 レスポンシブ（デスクトップ窓のリサイズ）

- **≥ 1200px**: 3 ペインすべて表示（既定）。
- **900–1199px**: 右ペインをオーバーレイdrawer化（トグルで開閉）。中央を優先。
- **< 900px**: 左ツリーもアイコンレール or drawer に畳む。中央プレビュー単独を最優先。
- ペイン幅はユーザー調整値を永続化（`localStorage` / Tauri store）。

### 7.2 状態デザイン

- **空状態**: `--accent-gradient` の繊細なイラスト的ヘッダ + 一次アクション（「テンプレートから作成」「フォルダを開く」）。Linear 的に上質・簡潔。
- **ローディング**: スケルトン（`--bg-sunken` のシマー・`--dur-slow`）。スピナー多用しない。
- **エラー**: `--danger` の控えめなバナー + 復帰アクション。検証エラーは日本語化メッセージ（既存 translateError 資産）。
- **書きかけプレビュー**: chrome-extension の previewRender と同思想 —「半端でも描画」。検証エラーは右ペイン側チャネルで表示、中央は描画を止めない。

### 7.3 アクセシビリティ

- コントラスト WCAG AA（本文 4.5:1 / 大文字 3:1）を両テーマで満たす。
- フォーカスリング常時可視（`--accent-subtle` 3px）。キーボード操作完全対応。
- `prefers-reduced-motion` 尊重（§4.4）。
- status は色 + ドット/ラベルの二重符号（色覚多様性）。

### 7.4 ガバナンスの UI 表現（baseline を UI に焼き込む）

- **Push ボタンは人間専用の視覚シグナル**（§6）: `⚠` アイコン + ツールチップ「push は人間が確認して実行します」。AI/MCP からは押せない導線設計（`git_push` は MCP tool に含めない・Issue 004 D-3）。
- **Commit は AI 可**だが、diff レビュー（右ペイン Git タブ）を経てから。
- **Secrets 入力**（OCR の API キー等・§15）は設定モーダルで人間手入力のみ。プレースホルダに「AI は投入しません」注記。
- **公開/非公開境界**（Issue 004 D-1）: private repo データ（receipts/expenses 等）には控えめな「非公開」インジケータ、templates/examples には「公開」タグ。

---

## 8. デザイントークン実装方針（Svelte 5）

- 全トークンを `:root` の CSS custom properties として単一の `src/lib/styles/tokens.css` に定義。ライトを既定、`:root[data-theme="dark"]` で上書き（+ `@media (prefers-color-scheme: dark)` を初期値に）。
- テーマ切替は `data-theme` 属性をルートに付与（Tauri store で永続化）。
- コンポーネントは Svelte の scoped style 内で**トークンのみ**参照（ハードコード色禁止）。本 DESIGN.md がトークンの唯一の出典。
- renderer-pdf の HTML プレビューは iframe or shadow DOM で隔離し、PDF 用 CSS とアプリシェル CSS の衝突を防ぐ（プレビューは「印刷正本の見た目」を保つ）。

---

## 9. 次アクション（DESIGN.md 確定後）

1. 本 DESIGN.md を PdM（田中さん）レビュー → 確定。
2. `apps/desktop/` に Tauri 2.x + SvelteKit（`adapter-static`）雛形をスキャフォールド（Issue 004 Phase 1）。
3. `tokens.css` を本ファイルから生成し、最小のアプリシェル（Top bar + 3 ペイン骨格 + テーマ切替）を実装。
4. renderer-pdf HTML 埋め込みの疎通（1 スキーマで先行）。
5. 以降 Issue 004 Phase 1〜3（file tree / git diff・commit / MCP P0）へ。

> **注意**: 本ファイルは「デザインの正本」。実装中に迷ったらコードでなくここへ戻る。トークン変更は PdM 合意の上で本ファイルを更新してから実装へ反映（§10 ドキュメント同期）。
