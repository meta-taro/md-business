// Phase 1c のプレビュー配線デモ用の seed。ファイルオープン（Phase 3）と
// エディター（Phase 2 CodeMirror）が未実装の間、右ペインが実ビューワーで
// 描画されることを示すために正本テンプレをそのまま読み込む。
//
// 正本を複製せず単一ソースに保つため、リポ正本 templates/api-spec/standard-ja.md を
// Vite の ?raw import で取り込む（pnpm workspace ルートは Vite が既定で許可）。
import apiSpecSample from '../../../../../templates/api-spec/standard-ja.md?raw';

export { apiSpecSample };
