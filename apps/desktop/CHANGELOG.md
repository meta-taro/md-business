# Changelog — @md-business/desktop

このアプリの変更履歴。バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## 0.1.0

初回配布リリース。

### 追加

- 6 種の業務文書（invoice / spec / test-spec / db-spec / nosql-db-spec / api-spec）を用途別ビューワーで開き、Markdown を左右 2 画面でライブ編集・PDF 出力する Tauri デスクトップアプリ。
- test-spec の TSV グリッド編集（表計算風の入力ウィジェット + エディターとの round-trip）。
- **アプリ内の自動アップデート**。起動時に新バージョンを自動確認し、ヘルプの「更新を確認」から手動確認もできる。更新は GitHub Releases の署名付き成果物を検証して適用する。

### 配布

- Windows（`.msi` / `.exe`）・macOS（universal `.dmg`）のインストーラを GitHub Releases で配布する。
- コード署名（Windows Authenticode / Apple 公証）は未対応。初回インストール時に発行元不明の警告が出る場合がある。
