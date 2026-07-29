// フォルダ未選択のときに右ペインへ出す初期文書。空の画面ではなく実ビューワーの
// 描画結果を見せるため、正本テンプレをそのまま読み込む。
//
// 正本を複製せず単一ソースに保つため、リポ正本 templates/api-spec/standard-ja.md を
// Vite の ?raw import で取り込む（pnpm workspace ルートは Vite が既定で許可）。
import apiSpecSample from '../../../../../templates/api-spec/standard-ja.md?raw';

export { apiSpecSample };
