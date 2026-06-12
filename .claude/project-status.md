# Project Status — md-business

最終更新: 2026-06-12

## 現在のフェーズ

**Phase 0: 骨格構築**

## 完了

- 2026-06-12 GitHub リポ `meta-taro/md-business` 作成（public + MIT）
- 2026-06-12 Phase 0 骨格焼き込み（pnpm workspace + LICENSE + CI + CLAUDE.md + baseline）
- 2026-06-12 Phase 0 初期 Issue 起票

## 進行中

- Phase 0 完了条件確認（`pnpm install` 成功 + CI green）

## 次タスク

1. ローカルで `pnpm install` を実行し、依存解決を確認
2. CI を最初に走らせ green になるか確認
3. Phase 1 着手判断（請求書 MVP）

## 既知の懸念

- npm scope `@md-business/` の空き未確証 → Phase 1 npm 公開直前に `npm view @md-business/probe` で実機確認
- LINE LIFF の業務文書系 OSS 先行事例なし → Phase 4 で完全新規実装

## 関連

- Roadmap: [./roadmap.md](./roadmap.md)
- Decisions: [./decisions.md](./decisions.md)
- baseline: [./rules/product-baseline.md](./rules/product-baseline.md)
