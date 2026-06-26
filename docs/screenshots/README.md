# md-business スクリーンショット保管庫

このディレクトリには、README / Chrome Web Store / Google Workspace Marketplace 用のスクリーンショットを配置します。

実画像は本リポではなく、各プロダクトの公開ストア（Chrome Web Store / Marketplace）申請素材からも参照可能なため、最新版の配置場所として本ディレクトリを正本扱いします。

## 撮影規格

| 公開先                          | サイズ                    | 形式                         | 枚数上限 |
| ------------------------------- | ------------------------- | ---------------------------- | -------- |
| Chrome Web Store                | 1280 × 800 px             | 24-bit PNG（アルファなし）   | 5 枚     |
| Google Workspace Marketplace    | 1280 × 800 / 1280 × 720   | PNG または JPG               | 5 枚     |
| README 用                       | 推奨 1280 × 800 px        | PNG（透過可）                | 任意     |

- アスペクト比を揃えるため、不足分は上下左右の白余白で補正する
- 個人情報・実在社名・登録番号・口座番号・印影は **絶対に含めない**（OSS リポはパブリック）
- 撮影時はテンプレート（`templates/invoice/*.md` 等）のダミー値で生成された画面を使用する

## 必要なスクリーンショット一覧（TODO）

差し替えは Issue #7 で track。Phase 1 公開済みの v0.5.0 / v0.7.0 のストア素材を流用予定。

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
