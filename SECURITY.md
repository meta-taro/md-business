# セキュリティポリシー — md-business

md-business シリーズの脆弱性報告と対応方針について。

## サポート対象バージョン

セキュリティ修正は **`main` ブランチの最新コミット**および **直近の Chrome Web Store / Google Workspace Marketplace 公開バージョン**を対象とします。

| プロダクト | サポート対象 |
|---|---|
| `apps/chrome-extension` | Chrome Web Store 公開バージョン + `main` |
| `apps/google-workspace-addon` | Google Workspace Marketplace 公開バージョン + `main` |
| `apps/pwa` | `main` |
| `packages/*` | npm 公開バージョン（公開後）+ `main` |

旧バージョンへのバックポートは原則行いません。新しい公開バージョンへの更新をお願いします。

## 脆弱性の報告方法

**公開 issue は使わないでください。** セキュリティ問題は以下のいずれかで報告してください:

1. **GitHub Security Advisories（推奨）** — [Report a vulnerability](https://github.com/meta-taro/md-business/security/advisories/new) ボタンから非公開でレポートを作成
2. それ以外の連絡経路が必要な場合は、GitHub Issue で「セキュリティ問題のため非公開連絡を希望」とだけ書いてください。メンテナから 1 営業日以内に Security Advisory を開きます

レポートには以下を含めてください:

- 影響を受けるプロダクト / バージョン / ファイルパス
- 再現手順（最小再現コード歓迎）
- 攻撃シナリオと想定される影響範囲
- 既知の回避策（あれば）

## 対応プロセスとタイムライン

| ステップ | 目安 |
|---|---|
| 受領確認 | 3 営業日以内 |
| 初期評価 / 重大度判定（CVSS v3.1） | 7 営業日以内 |
| 修正版リリース | Critical: 14 日 / High: 30 日 / Medium 以下: 次回マイナーリリース |
| 公開ディスクロージャ | 修正版リリース後、報告者と協議のうえ Security Advisory を公開 |

報告者は **修正版リリースまで非公開を維持してください**（responsible disclosure）。協議のうえ公表時にクレジットします（希望する場合）。

## 範囲外（Out of scope）

以下は本プロジェクトのセキュリティ報告対象外です:

- ユーザー自身が設定した GitHub Personal Access Token の漏洩（PAT はユーザーの Google アカウント内 `PropertiesService` に保管されており、md-business 開発元はアクセスできません）
- Google Workspace / Chrome / GitHub プラットフォーム自体の脆弱性 — それぞれの提供元へ報告してください
- 利用者の環境設定（OS / ブラウザ拡張機能の組み合わせ）に起因する問題
- DoS / レートリミット回避を目的とした報告
- ソーシャルエンジニアリング・物理アクセス

## 関連

- プライバシーポリシー: [PRIVACY.md](./PRIVACY.md)
- ライセンス: [LICENSE](./LICENSE)
- 連絡先: GitHub Issues / GitHub Security Advisories
