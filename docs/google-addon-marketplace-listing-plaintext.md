# Google Workspace Marketplace 詳細説明 — Console 貼付用平文版

> Marketplace SDK の「アプリ構成 → 詳細な説明」フィールドに **このまま貼付** できる平文版です。Markdown 記法は除去済み。文字数は約 3,400 字（4,000 字制限内）。
>
> 出典: [`docs/google-addon-marketplace-listing.md`](./google-addon-marketplace-listing.md) の「詳細な説明」セクションを Markdown → 平文へ整形。
>
> 整形漏れの検知は `apps/google-workspace-addon/test/marketplaceListingPlaintext.test.ts` で自動化されています（Markdown 見出し / 強調 / fence / `[text](url)` / `- ` リストの混入を弾く）。
>
> 貼付対象は下記の HTML コメントマーカー間（先頭が BEGIN / 末尾が END）です。マーカー行は Console に貼付しないでください。

---

<!-- BEGIN PLAINTEXT -->
md-business は、Markdown ファースト × 特化ビューワー × 多チャネル配信 の OSS シリーズです。本 Google Workspace アドオンは、Markdown と Google Docs / Sheets / Slides を双方向で同期し、さらに検証シート（テスト項目書）を Sheets で編集して、サイドバーの「GitHub に push」ボタンで GitHub commit する開発フロー連携を提供します（git push と同じメンタルモデル）。

【こんな悩みに】

・Markdown で書いた業務文書を、Google ドキュメントで共同編集したい
・Sheets で編集した検証シートを、Git 管理可能な Markdown として保存したい
・請求書・基本設計書・検証シートをエンジニアと非エンジニアが同じデータで触りたい
・PDF への変換は Google ネイティブ機能で十分。md ⇔ ドキュメント の往復と Git 連携が欲しい

【できること（v0.7.1）】

・Markdown ⇄ Google Sheets 双方向変換: サイドバーに「schema: test-spec/v1」の YAML frontmatter を含む md を貼り付けて「インポート」すると、列スキーマ（型 / enum / 日付 / チェックボックス / URL など）に従って DataValidation と ConditionalFormat が自動適用された Sheets に変換されます。md 本文の表もそのまま行データとして取り込まれます。Sheets を編集して「md 書き出し」を押すと、frontmatter + 表形式の Markdown へラウンドトリップで戻ります。
・検証シート（test-spec）の列スキーマ強制: enum 値の制約・日付バリデーション・必須列の検証を Sheets 上で即時フィードバック。サイドバーから「検証」ボタンで未知の列名・enum 違反・型不一致をまとめてレポートします。
・そのまま使える列レイアウト: frontmatter の「幅倍率」と「折り返し」指定で、AI が作成した md でも Sheets 化時に「項目=狭め / 手順=広め / 備考=広め」の列幅と複数行折り返しが自動適用されます。Gemini in Sheets と組み合わせると、開いた瞬間から自然な表として認識・整形してもらえます。
・未入力セルの寛容処理: 列を「必須: false」で宣言すると、未実施・未確定の行で当該セルを空のままにしてもエラーになりません。未入力は空セルで表現するのが推奨です（OSS 公開のデータセル運用規約に準拠）。
・GitHub Push（オプトイン）: ユーザー自身が GitHub Personal Access Token を設定し、frontmatter の「repository: owner/repo@branch:path」で送信先を宣言した上で、サイドバーの「GitHub に push」ボタンを押すと、Sheets の現在の内容を .md として commit します。「git push」と同じメンタルモデルで、保存したいタイミングだけ 1 commit するため、編集中の中間状態で git 履歴が汚れません。コミットメッセージは frontmatter の「documentNumber」から自動生成します。
・業務寄りのテンプレート内蔵: 適格請求書 / 基本設計書 / 受発注ワークフロー検証シートのサンプルテンプレを内蔵。Markdown 初心者でも貼り付けるだけで雛形が動きます。
・Docs / Sheets / Slides いずれの画面からも、右側パネルからアドオンを呼び出せます。

【このアドオンの位置づけ】

md-business シリーズは「Markdown が真実、各ビューワーは表現」という設計思想です。本アドオンは Google Sheets を「データ入力面」、Markdown を「正本」として扱い、両者を双方向で同期します。

PDF 出力は Google Docs / Sheets / Slides の既存「ファイル → ダウンロード → PDF」機能に任せ、本アドオンでは扱いません。手元の .md から印刷品質の PDF を作りたい場合は、姉妹プロダクトの Chrome 拡張「md-business Markdown 業務文書ビューワー」 https://chromewebstore.google.com/ をご利用ください。

【オープンソース】

・ソースコード: https://github.com/meta-taro/md-business
・ライセンス: MIT
・Issue / バグ報告: https://github.com/meta-taro/md-business/issues
・fork して各社カスタムを作ることを推奨。本家へのマージは強制しません。

【権限とプライバシー】

本アドオンは以下の 5 スコープを要求します。GitHub Push 機能のため、1 件のみが Google のセンシティブ（Sensitive）スコープに該当します。アクティブドキュメントへの読み書きはすべて .currentonly 系の最小権限スコープで行います。

センシティブスコープ:

・script.external_request — GitHub REST API への HTTPS 通信（ユーザー設定の GitHub リポジトリへの commit）。ユーザーが「GitHub に push」ボタンを押した時のみ実際に通信が発生します。

非センシティブスコープ:

・spreadsheets.currentonly — 現在開いている Sheets のみ読み書き
・documents.currentonly — 現在開いている Docs のみ読み書き
・presentations.currentonly — 現在開いている Slides のみ読み書き
・script.container.ui — サイドバー UI の表示

送信先は GitHub のみで、送信先リポジトリ・ブランチ・パスはユーザーが frontmatter「repository:」で決定します。md-business 開発元を含む第三者にデータが渡ることはありません。「GitHub に push」ボタンを押さない限り、本アドオンは外部ネットワークと一切通信しません。

詳細は GitHub の PRIVACY.md をご確認ください: https://github.com/meta-taro/md-business/blob/main/PRIVACY.md

【想定ユーザー】

・エンジニア: 業務文書を Git で管理したい・PR レビューで仕様変更を追跡したい
・PdM / PjM: 検証シートを Sheets で関係者と共有しつつ、md として Git にも残したい
・個人事業主・小規模事業者: 適格請求書を Markdown で版管理しつつ、必要に応じて Google Sheets で計算したい

【動作要件】

・Google Workspace アカウント（個人 Gmail / Workspace 法人 / 教育のいずれも対応）
・Google Docs / Sheets / Slides いずれかが利用可能であること
・GitHub Push 機能を使う場合は GitHub アカウント + Personal Access Token（contents: write 権限）
・特別なソフトウェアのインストールは不要（ブラウザのみ）

【サポート】

・バグ報告 / 機能要望: GitHub Issues https://github.com/meta-taro/md-business/issues
・セキュリティ脆弱性: GitHub リポジトリ内 SECURITY.md を参照

【今後のロードマップ】

1. v0.7.2 — 書式テンプレート参照（複数結果列〈Chrome / Safari / iOS / Android〉の書式重複解消）
2. v0.8.0 — DB 設計書スキーマ（schema-db-spec / schema-nosql-db-spec）対応
3. v0.9.0 — GitHub Action 連携（PR で md → Sheets diff コメント）
4. v1.0.0 — Slides スキーマ

最新版は GitHub リポジトリ（リリースタブ）を確認してください。
<!-- END PLAINTEXT -->
