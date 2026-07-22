# md-business Desktop — DESIGN.md

> **本命プロダクトのデザイン正本**（baseline §11 / [[decisions.md]] 2026-07-16「デスクトップはデザイン重視で作る」）。
> UI 実装（Svelte 5 + SvelteKit）に入る前にここで**デザイン言語を固定**する。手戻り防止のため、
> 実装は本ファイルのトークン（CSS custom properties）を唯一の出典として参照する。
>
> - **トーン**: Linear 風・モダン SaaS（洗練・上質・余白広め・繊細なアクセント・丁寧なマイクロインタラクション）
> - **フロント**: Svelte 5 + SvelteKit（`adapter-static` / SSR off・Tauri 静的アセット）
> - **テーマ**: 両対応（**ライト主軸**設計・ダーク同等パリティ）を実装（昨今の主流・PdM 確定 2026-07-16）
> - **中心インタラクション**: **左＝Markdown エディター / 右＝用途別ビューワー、編集するとプレビューが即ライブ同期**（PdM 確定 2026-07-16）。ビューワーの **PDF 出力**、裏で **git / gh / glab** を叩く Git・フォージ連携を備える
> - **基本機能**: Git 連携で `.md` を管理 → frontmatter の `schema:` で 6 用途別ビューワーが自動起動 → 編集ライブプレビュー → PDF 出力
> - **関連**: `.claude/issues/004-v1.0-tauri-desktop-mcp-accounting-mvp.md` E 章 / §6（エディター↔プレビュー・Git/フォージ・PDF）

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

### 5.8 検証グリッド（スプレッドシート編集面）

§5.3 の読み取り表（プレビュー）とは役割が異なる。検証シートの TSV 編集グリッド（`TsvGrid`）は **QA が Office / Workspace なしで検証を完了する本命の入力面**であり、見た目・操作感を **スプレッドシート（Excel / Google Sheets）に寄せる**（田中さん要件 2026-07-22「まるでスプレッドシートと同様の使用感」）。

- **罫線＝セル境界**: §5.3 と違い**縦罫線あり**。全セルの右・下に 1px `--border`。罫線がセルを区切るので、セルごとの枠付き input は**置かない**（フォーム感＝「HTML 感」の除去）。
- **セルは通常表示・その場編集**: 入力ウィジェット（text / select / date / number / textarea 等）は**枠なし・角丸なし・地は透明**でセルいっぱいに敷く。セルは値をそのまま表示し、クリックで選択、タイプで即編集。
- **アクティブセル**: `focus-within` で `inset 0 0 0 2px --accent` の選択リング + 微 `--accent-subtle` 地（Excel の選択枠に相当）。
- **密度**: 既定は 1 行・行高 ~30px（現状の 2 行テキストエリアは高すぎるので単行既定へ）。複数行セルはフォーカス時のみ縦に伸ばす。
- **固定**: ヘッダ行は `sticky top`、行番号列は `sticky left`（横スクロールで列見出し・行番号が常に見える）。
- **数値列**: `tabular-nums` 右寄せ。空セルは**空のまま**（[[data-cell-conventions]]）。
- **検証エラー**: 該当セルに `--danger` の左内側マーカー + 淡い赤地。ホバーでメッセージ（title）。
- **全画面**: 検証中はエディター/プレビュー分割を畳み、グリッドを全幅表示できるトグルを持つ（§6 参照）。

---

## 6. レイアウト（エディター ↔ プレビュー ライブ同期が主役）

**中心インタラクションは「左＝Markdown エディター / 右＝ビューワー、編集するとプレビューが即同期」**（PdM 確定 2026-07-16）。VS Code / Obsidian / Typora の左右分割 + Linear の静けさ。File Tree は左レール、Git / AI / MCP は必要時に開く右パネル（既定は畳む）＝**エディターとプレビューに画面を最大限割く**。

```
┌────────────────────────────────────────────────────────────────────────┐
│ ● md-business    受発注 API 設計書  [●承認済]   [PDF]  ⌘K   ◐  ⚙        │ ← Top bar 44px
├──────────┬─────────────────────────┬─────────────────────────┬─────────┤
│ File Tree│  Editor（Markdown）      │  Preview（ビューワー）    │ Git/AI  │
│ 220–300px│  flex・min 360px         │  flex・min 360px         │ 折畳可  │
│          │                         │                         │ 300–400 │
│ ▸ specs/ │ ---                     │ ┌─ API 設計書 ─────────┐│ ┌tabs─┐│
│ ▸ api/   │ schema: api-spec/v1     │ │ 受発注 API  ●承認済   ││ │Git  ││
│ ▸ db/    │ title: 受発注 API       │ │ ─────────────────    ││ │Diff ││
│ ▸ tmpl/  │ endpoints:              │ │ POST /orders         ││ │AI   ││
│          │   - method: POST        │ │ (renderApiSpecBody   ││ │MCP● ││
│          │ ...                     │ │  の HTML を iframe)   ││ └─────┘│
│          │ ↑ 編集 → debounce ─────▶│ │ ↑ 即再描画・スク同期  ││        │
├──────────┴─────────────────────────┴─────────────────────────┴─────────┤
│ Git: 2 changed  [Commit]  [Push ⚠人間]   forge: GitHub ●    MCP ● 接続  │ ← Status bar 32px
└────────────────────────────────────────────────────────────────────────┘
```

- **Top bar 44px（＝フレームレスの自作タイトルバー）**: 左＝アプリ識別、中央＝文書タイトル + status バッジ、右＝**PDF 出力** / `⌘K` / テーマ切替 `◐` / 設定 `⚙`、さらに右端に**ウィンドウコントロール（最小化 ─ / 最大化 ▢⇄復元 ❐ / 閉じる ✕）**。§6.5。
- **ペイン境界**: 1px `--border`。ドラッグでリサイズ可能（ハンドルはホバーで `--accent` 薄表示）。幅はユーザー調整値を永続化（Tauri store）。
- **エディター（左中）**: `--bg-app`・等幅フォント（`--text-sm`）。生の `.md`（YAML frontmatter + Markdown 本文）を編集。§6.1。
- **プレビュー（右中）**: `--bg-app`。renderer-pdf の HTML 出力（`renderApiSpecBody` 等）を iframe 隔離で埋め込む（§8）。編集に追従して即再描画（§6.2）。
- **Git / AI / MCP パネル（右・折畳可）**: `--bg-subtle`。既定は畳んでエディター↔プレビューを広く。タブ（Git diff / AI チャット / MCP ログ）。§6.3。
- **Status bar 32px**: Git 変更数・Commit・**Push（⚠人間のみ・§7.4）**・**forge 種別（GitHub / GitLab・§6.3）**・MCP 状態。

### 6.1 エディター

- **CodeMirror 6**（Svelte 統合・軽量・拡張性）。Markdown + YAML frontmatter のシンタックスハイライト、行番号、括弧対応、検索。テーマは §2 トークンに合わせた light/dark 2 種を用意。
- 表示切替: **左右分割（既定）** / エディターのみ / プレビューのみ をトグル。ビューワー単独起動（読むだけ）も可。
- スキーマ別に「用途にちなんだビューワー」が立ち上がる＝frontmatter の `schema:` / detect マーカーで 6 種（invoice / spec / test-spec / db-spec / nosql-db-spec / api-spec）を自動判定（既存 chrome-extension の `createDefaultRegistry` / detect ロジックを移植・共有）。

### 6.2 ライブ同期（編集 → プレビュー即反映）

- 編集イベントを **debounce（既定 150–250ms）** → 生 `.md` を parse（gray-matter 相当）→ normalize → autofill → validate → `renderXxxBody` で再描画。**この一連は chrome-extension の `previewRender` パイプラインをそのまま再利用**（「書きかけでも半端に描画」§7.2・検証エラーは Git/AI パネル or インライン下部にサイドチャネル表示、プレビューは止めない）。
- **スクロール同期**（理想・段階実装）: エディター行 ↔ プレビュー対応位置の双方向スクロール連動。まずは編集追従の再描画を優先し、スクロール同期は次段。
- 純関数レンダラ（renderer-pdf）+ 純関数検証（standalone Ajv）を共有するので、**プレビューの見た目は PDF 出力と 1:1**（画面で見たものがそのまま印刷正本）。

### 6.3 Git / フォージ連携（裏で git + gh + glab）

- **ローカル Git 操作**は Rust 側（`git2-rs` / gitoxide）で完結（status / diff / stage / commit / branch / log）。UI は Git パネルで diff 表示 → **Commit（AI 可・§7.4）**。
- **リモート・フォージ操作**は CLI を裏で呼ぶ抽象化レイヤー「**forge**」を設ける:
  - `github` アダプタ → `gh`（PR 作成 / Issue / CI 状態）
  - `gitlab` アダプタ → `glab`（MR 作成 / Issue / パイプライン状態）
  - リポジトリの remote URL（`github.com` / `gitlab.com` / self-hosted）から自動判定、Status bar に **forge 種別**を表示。
- **Push は人間のみ**（§7.4 / baseline §6）＝ forge アダプタも push/MR-merge を AI 自走させない。gh/glab は「read 系（status/list/view）」と「人間トリガーの write（PR/MR 作成）」に分離。
- **MVP は GitHub（gh）先行**。`glab` は未導入のため GitLab 連携フェーズで導入（forge インターフェースは最初から両対応で設計し、アダプタを後から差す）。

### 6.4 PDF 出力

- Top bar の **[PDF]** で現在の文書をビューワー見た目のまま A4 PDF 出力（renderer-pdf + Paged.js 資産を流用）。保存先は OS のファイルダイアログ（Tauri `dialog`）。
- 画面プレビュー = PDF なので「印刷して配布」まで 1 クリック（手元配布用途・CLAUDE.md の Chrome 拡張の役割をデスクトップにも内包）。

### 6.5 ウィンドウクローム（フレームレス自作タイトルバー・PdM 確定 2026-07-16）

**決定**: OS ネイティブのタイトルバーを廃し（`tauri.conf.json` の `decorations: false`）、Top bar 自体をタイトルバーとして機能させる（VS Code / Linear と同型）。

- **理由**: ネイティブ窓枠はテーマに追従せず、ダーク時に白いタイトルバーだけが浮く不一致が出る。窓枠ごと自作 HTML にすることで**ライト/ダークが窓全体で完全統一**され、「かっこいいから使いたい」という所有欲要件（[[project-desktop-coolness-is-a-goal]]）を満たす。
- **ドラッグ**: ヘッダー地に `data-tauri-drag-region`。`.lead` / `.center` は `pointer-events:none` で地に貫通させ、どこを掴んでも窓移動できる。ボタン群（`.right` 配下）は貫通させずクリック可能。権限は `core:window:allow-start-dragging`。
- **ウィンドウコントロール**: 右上角にフル高で密着（Fitts の法則）。最小化 `─` / 最大化 `▢`⇄復元 `❐`（状態で切替）/ 閉じる `✕`（ホバーで `--danger-fg` 赤）。IPC は `@tauri-apps/api/window`（`minimize` / `toggleMaximize` / `close` / `isMaximized`）。純ロジック（グリフ・ラベル）は `src/lib/window/titlebar.ts`、副作用層は `titlebar.svelte.ts`（ブラウザ実行時は no-op ガード）。
- **Windows 挙動**: `shadow: true`（既定）維持で Win11 は DWM 経由の**リサイズ枠・角丸・影を保持**。失われるのは最大化ボタンホバー時の Win11 スナップ・フライアウトのみ（ネイティブキャプション判定が必要）＝**後続ポリッシュ**（端ドラッグ・Win+矢印のスナップは有効）。

---

## 7. レスポンシブ / 状態 / アクセシビリティ / ガバナンス表現

### 7.1 レスポンシブ（デスクトップ窓のリサイズ）

- **≥ 1280px**: File Tree + エディター + プレビュー + Git/AI パネル（パネルは既定折畳）を表示。
- **1000–1279px**: Git/AI パネルはオーバーレイ drawer 化。エディター↔プレビューの左右分割を維持。
- **768–999px**: File Tree をアイコンレール or drawer に畳む。エディター↔プレビューを最優先で確保。
- **< 768px**: 左右分割をやめ、エディター / プレビューをタブ切替（片方ずつ全幅）。
- 各ペイン幅・分割比・表示モード（分割/エディターのみ/プレビューのみ）はユーザー調整値を永続化（Tauri store）。

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

## 9. 実装フェーズ（DESIGN.md 確定後）

デザイン先行（§11）→ 小さいフェーズ（CLAUDE.md）で TDD 式に積む。各フェーズ末で lint/typecheck/test 緑 + commit（push は人間 §6）。

1. **Phase 1a — scaffold**: `apps/desktop/` に Tauri 2.x（`src-tauri/` Rust crate）+ SvelteKit（`adapter-static`・SSR off）雛形。`@tauri-apps/cli` は pnpm devDependency。`tauri dev` でウィンドウ起動確認。
2. **Phase 1b — アプリシェル**: `tokens.css` を本ファイルから生成、Top bar + レイアウト骨格（File Tree レール + エディター↔プレビュー分割 + 折畳パネル）+ **テーマ切替（light/dark・`data-theme`・Tauri store 永続化）**。
3. **Phase 1c — ビューワー疎通**: renderer-pdf の HTML 出力を iframe 隔離で 1 スキーマ（api-spec）先行埋め込み。既存 registry / detect を移植。
4. **Phase 2 — エディター + ライブ同期**: CodeMirror 6 導入、編集 → debounce → previewRender 再利用 → プレビュー即再描画（§6.1/6.2）。6 スキーマ自動判定。
5. **Phase 3 — Git / フォージ**: Rust 側ローカル Git（status/diff/commit）+ Git パネル、forge 抽象（gh 先行・glab は後）。**Push は人間 UI**（§7.4）。
6. **Phase 4 — PDF 出力**（§6.4）+ 以降 Issue 004 の MCP P0 5 tools へ。

> **注意**: 本ファイルは「デザインの正本」。実装中に迷ったらコードでなくここへ戻る。トークン変更・レイアウト変更は PdM 合意の上で本ファイルを更新してから実装へ反映（§10 ドキュメント同期）。
