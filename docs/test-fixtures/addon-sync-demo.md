---
スキーマ: test-spec/v1
文書番号: TEST-SYNC-DEMO-0001
タイトル: GitHub 自動同期 動作確認用 検証シート
版: "0.1.0"
発行日: "2026-06-23"
ステータス: 実施中
テーマ: 青
作成者:
  - 名前: meta-taro
    役割: PdM
repository: meta-taro/md-business@test/addon-sync-demo:docs/test-fixtures/addon-sync-demo.md
列定義:
  - 名前: 項目
    型: 文字列
    幅倍率: 2
  - 名前: 手順
    型: 複数行
    幅倍率: 3
  - 名前: 期待結果
    型: 複数行
    幅倍率: 3
  - 名前: 結果
    型: プルダウン
    値: [OK, NG, 保留, 未実施]
    幅倍率: 1
    書式:
      OK:
        行背景色: "#e6f4ea"
      NG:
        行背景色: "#fce8e6"
      保留:
        行背景色: "#f1f3f4"
      未実施:
        行背景色: "#dadce0"
  - 名前: 実施日
    型: 日付
    必須: false
    幅倍率: 1.2
  - 名前: 担当
    型: 文字列
    必須: false
    幅倍率: 1
  - 名前: 備考
    型: 複数行
    幅倍率: 3
ファイル名: "addon-sync-demo"
---

# GitHub 自動同期 動作確認用 検証シート

本ファイルは Google Workspace アドオン「md-business」の **GitHub 自動同期機能** の実機検証用 fixture です。
PdM が Workspace Marketplace 申請前に動作確認するためのみに使用します。

## 検証手順

1. GitHub で PAT を発行（`contents: write` スコープ、対象 repo は `meta-taro/md-business` のみ）
2. Sheet 側で md-business サイドバーを開き、本ファイルの内容を textarea に貼付
3. 「検証シート: セットアップ」を実行
4. 「PAT を保存」で PAT を投入
5. 「有効化」で onEdit installable trigger を登録
6. Sheet を 1 セル編集 → 2 秒静まり後に GitHub `test/addon-sync-demo` ブランチへ自動 commit が立つことを確認

## 検証結果

| 項目 | 手順 | 期待結果 | 結果 | 実施日 | 担当 | 備考 |
|---|---|---|---|---|---|---|
| PAT 保存 | サイドバーで PAT を保存 | 「PAT を保存しました」が表示 | 未実施 | — | — | — |
| 有効化 | 「有効化」ボタンを押下 | sheetName と repoRef が status に表示される | 未実施 | — | — | — |
| onEdit 検出 | 任意セルを編集 | サイドバー status が「commit 中...」に変わる | 未実施 | — | — | — |
| GitHub commit 反映 | GitHub UI で `test/addon-sync-demo` の commit を確認 | 編集内容が docs/test-fixtures/addon-sync-demo.md に PUT されている | 未実施 | — | — | — |
| 連続編集デバウンス | 2 秒以内に複数セル編集 | commit が 1 件にまとまる（連発しない） | 未実施 | — | — | — |
| 無効化 | 「無効化」ボタン押下 | trigger 削除完了メッセージ | 未実施 | — | — | — |

## メモ

- 本 fixture は実機検証専用です。検証完了後に branch `test/addon-sync-demo` ごと削除 / 残置の判断を行います。
- PAT は人間（PdM）のみが扱います（baseline §15）。AI は PAT 値を読み書きしません。
