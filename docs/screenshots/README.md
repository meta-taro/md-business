# md-business スクリーンショット保管庫

このディレクトリには、ダウンロードページ / README / Chrome Web Store / Google Workspace Marketplace 用のスクリーンショットを配置します。

実画像は本リポではなく、各プロダクトの公開ストア（Chrome Web Store / Marketplace）申請素材からも参照可能なため、最新版の配置場所として本ディレクトリを正本扱いします。

## 撮影規格

| 公開先                          | サイズ                    | 形式                         | 枚数上限 |
| ------------------------------- | ------------------------- | ---------------------------- | -------- |
| ダウンロードページ              | 1600 × 1000 px（16:10）   | PNG                          | 5 枚     |
| Chrome Web Store                | 1280 × 800 px             | 24-bit PNG（アルファなし）   | 5 枚     |
| Google Workspace Marketplace    | 1280 × 800 / 1280 × 720   | PNG または JPG               | 5 枚     |
| README 用                       | 推奨 1280 × 800 px        | PNG（透過可）                | 任意     |

- アスペクト比を揃えるため、不足分は上下左右の白余白で補正する
- 個人情報・実在社名・登録番号・口座番号・印影は **絶対に含めない**（OSS リポはパブリック）
- 撮影時はテンプレート（`templates/invoice/*.md` 等）のダミー値で生成された画面を使用する

## デスクトップアプリの撮影手順

### 何を写すか

写真は「入れてみないと分からない」を埋めるためのものなので、**画面の説明ではなく、その画面で何ができるか**が
1 枚で伝わる状態を撮る。

| ファイル名                        | 撮る画面                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| `desktop-invoice.png`             | 適格請求書を開いた状態。左にファイル一覧、右に請求書ビュー               |
| `desktop-editor.png`              | Markdown の左右 2 画面ライブ編集（編集中の行がプレビューに出ている状態） |
| `desktop-test-spec-grid.png`      | 検証シートのグリッド。OK / NG / 保留 の色分けが見えるように行を混ぜる    |
| `desktop-mcp.png`                 | MCP タブ。AI が実行した操作の履歴が数行並んでいる状態                    |
| `desktop-pdf.png`                 | PDF 出力プレビュー（A4 の紙面が見えている状態）                          |

### 撮影の準備（漏らさないための下ごしらえ）

「気をつけて撮る」ではなく、**写り込みようがない場所で撮る**。撮影者の注意力に頼ると、5 枚のうち 1 枚で必ず漏れる。

1. `templates/` をユーザー名の入らない場所へコピーする（例: `C:\demo\md-business` / `~/demo/md-business`）。
   テンプレートの値はすべてダミーで、スキーマ検証も通っている状態が保証されている
2. アプリで **そのフォルダだけ**を開く。ふだん使っているフォルダは開かない
3. ウィンドウ幅を 1600px 前後にし、全画面にしない（デスクトップや他アプリが写り込まない）
4. ウィンドウ単位で撮る（Windows: `Alt` + `PrintScreen` / macOS: `Cmd` + `Shift` + `4` → `Space`）。
   画面全体を撮ってから切り抜くと、切り抜き漏れが起きる

### 出す前の確認（1 枚ずつ見る）

| 見るところ           | 何が漏れるか                                                             |
| -------------------- | ------------------------------------------------------------------------ |
| パンくず・タイトルバー | `C:\Users\<氏名>` — フォルダを開き直せば消える                          |
| ファイル一覧          | 実案件のファイル名。取引先名は名前だけで漏れる                           |
| **MCP タブ**          | **接続トークン**。`.png` に載ると差し替えでは消えない（履歴に残る）      |
| 通知・タスクバー      | メール件名、他アプリの通知                                               |
| 請求書ビュー          | 実在の社名・登録番号・口座番号・印影                                     |

**MCP タブは「接続設定を写す」を押していない状態**で撮る。トークンが画面に出ている間はシャッターを切らない。

万一トークンが写ったものを公開してしまった場合は、画像を差し替えるだけでは不十分（Git 履歴と GitHub Pages の
キャッシュに残る）。トークンは接続先を毎回変えないために保存されており、**再起動しても変わらない**。
アプリ設定フォルダの `mcp.json` を消してから起動すると新しい値が発行されるので、**まず無効化**してから対処を決める
（Windows: `%APPDATA%\io.github.meta-taro.mdbusiness\mcp.json` / macOS: `~/Library/Application Support/io.github.meta-taro.mdbusiness/mcp.json`）。

## 必要なスクリーンショット一覧（TODO）

差し替えは Issue #7 で track。Phase 1 公開済みの v0.5.0 / v0.7.0 のストア素材を流用予定。

デスクトップアプリの 5 枚は**ダウンロードページ（`docs/download/index.html`）が参照している**。
このディレクトリへ置けば**ページ側の編集は要らず、次の公開で自動的に出る**。
1 枚も無い間は「画面を見る」の節ごと出ないので、**途中まで揃った状態でも壊れない**
（揃った分だけ出る）。

- [ ] `desktop-invoice.png` — 適格請求書を開いた画面（左にファイル一覧、右に請求書ビュー）
- [ ] `desktop-editor.png` — Markdown の左右 2 画面ライブ編集
- [ ] `desktop-test-spec-grid.png` — 検証シートのグリッド（OK / NG / 保留 の色分けが見える状態）
- [ ] `desktop-mcp.png` — MCP タブ（操作履歴が数行並んだ状態・**トークンを写さない**）
- [ ] `desktop-pdf.png` — PDF 出力プレビュー（A4 の紙面）
- [ ] `chrome-extension-viewer.png` — Chrome 拡張で適格請求書を表示している様子
- [ ] `chrome-extension-pdf.png` — A4 PDF 出力プレビュー
- [ ] `addon-test-spec-sheet.png` — Google Workspace Add-on で検証シートを Sheets 表示
- [ ] `addon-github-push.png` — サイドバーから GitHub へ push する操作
- [ ] `pwa-document-list.png` — PWA のドキュメント一覧（v0.6.0 以降）

## 出典・流用元

- Chrome Web Store v0.5.0 公開時に提出した 5 枚（extension ID: `lmdplkkfmgapnhombimeohjliinifgjh`）
- Google Workspace Marketplace 申請素材（`docs/google-addon-marketplace-listing.md` 経由）

## 関連

- 公開ストア宣材一覧: `docs/google-addon-marketplace-listing.md`
- Console 貼付用平文版: `docs/google-addon-marketplace-listing-plaintext.md`
