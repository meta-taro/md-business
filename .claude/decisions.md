# Decisions — md-business

司令塔リポ側 `projects/md-business/decisions.md` が正本。本ファイルは配布リポでの作業時参照用ミラー。

| 日付 | 決定 | 理由 |
|---|---|---|
| 2026-06-12 | リポは `meta-taro/md-business`（個人 GitHub・public・MIT） | OSS は個人アカウント運営方針 |
| 2026-06-12 | モノレポ採用（pnpm workspace + Turborepo） | スキーマ⇔ビューワーが 1:1 で密結合・同期リリース必須・fork 容易性 |
| 2026-06-12 | npm scope は `@md-business/` 推奨 | GitHub Org `mdbiz` が既存。Phase 1 公開時に `npm view` で実機確認 |
| 2026-06-12 | PDF レンダラを 2 系統並立: ブラウザ = Paged.js / サーバ = Typst | Typst の WASM ブラウザ動作は重い・Paged.js は HTML/CSS でハッカブル・Typst は inboisu で日本のインボイス対応即成立 |
| 2026-06-12 | 請求書スキーマは `mkpoli/typst-inboisu` を参照源とする | 唯一の現役 OSS で適格請求書要件を満たしている |
| 2026-06-12 | Chrome 拡張は `simov/markdown-viewer` を fork ベース | MV3 対応・GitHub raw MD レンダリング実装あり・MIT 互換 |
| 2026-06-12 | VS Code 拡張は `estruyf/vscode-front-matter` の Content Type 拡張 | 既存資産流用・frontmatter フォーム UI が完成度高い |
| 2026-06-12 | やる配布チャネル: Google Docs / Chrome / VS Code / PWA / LINE LIFF / GitHub Action | PdM 指示。非エンジニアから開発者まで網羅 |
| 2026-06-12 | やらない配布チャネル: Obsidian/Logseq / Word アドイン | PdM 指示 |
| 2026-06-12 | ライセンス MIT | OSS 王道・fork 自由を担保 |
| 2026-06-12 | UI は Lit Web Components + Tailwind CSS v4 | フレームワーク非依存・各 app に組み込みやすい |
| 2026-06-12 | コアは TypeScript | 全環境で使い回し可・型安全 |
| 2026-06-12 | 配布リポ担当者への外部委譲なし。司令塔セッションで実装 | 規模・思想・OSS 運営判断 |
