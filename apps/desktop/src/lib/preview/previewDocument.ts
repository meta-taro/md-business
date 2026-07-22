/**
 * iframe プレビュー用の完全な HTML 文書を組み立てる純関数。
 *
 * デスクトップの右ペインは、用途別ビューワー（renderer-pdf の body 断片）を
 * `<iframe srcdoc>` に隔離して描画する。iframe を使う理由:
 *   - api-spec.css などの文書 CSS を、アプリ本体のスタイルと衝突させない
 *   - 印刷（PDF 出力）時に文書だけを対象にできる
 *
 * iframe の中身は親ドキュメントとは別ツリーなので、アプリ側の
 * `:root[data-theme]` は継承されない。ライト/ダークを一致させるには、この関数が
 * iframe 内 `<html>` に `data-theme` を刻印する必要がある（api-spec.css の
 * ダーク上書きが iframe 内でも効くようにするため）。
 *
 * さらに `color-scheme` も theme に合わせて刻む。これが無いと WebView は文書を
 * ライト既定として扱い、背景無指定の要素の下にある canvas（ルート背景）を白で塗る。
 * そこへダークの文字色（ほぼ白）が乗ると「白地に白文字」で読めなくなる（背景を明示
 * 指定したコードブロックだけ読める、という崩れ方になる）。ネイティブ UI（スクロール
 * バー・フォーム部品）のダーク化も兼ねる。
 *
 * bodyHtml は renderer-pdf 側で値がすべて escape 済みの「断片」なので、ここでは
 * 二重エスケープしない。外から来るのは title / lang / theme のみで、これらは
 * 属性・テキストとして escape する。
 */

export type PreviewTheme = 'light' | 'dark';

export interface PreviewDocumentInput {
  /** renderer-pdf が生成した body HTML 断片（値は escape 済み）。 */
  bodyHtml: string;
  /** インライン化する文書 CSS（api-spec.css 等）のテキスト。 */
  css: string;
  /** ドキュメントタイトル（<title>）。escape される。 */
  title?: string;
  /** iframe 内 <html data-theme>。アプリのテーマと一致させる。既定 light。 */
  theme?: PreviewTheme;
  /** <html lang>。既定 'ja'。 */
  lang?: string;
}

/** 属性値・テキスト双方に使える最小 HTML エスケープ。
 *  renderer-pdf にも同等関数はあるが、このモジュール（iframe 組み立て）を
 *  依存ゼロの純ユニットに保つため、あえてローカルに小さく持つ。 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * iframe 内で走らせるショートカット横取りスクリプト。
 *
 * iframe（プレビュー）にフォーカスがある時の keydown は親 window の
 * `svelte:window onkeydown` へ伝播しないため、親側の Ctrl+P / Ctrl+S ハンドラが
 * 発火せず、WebView2 ネイティブの Ctrl+P が「アプリ全体」を印刷してしまう。
 * これを塞ぐため iframe 自身にも同じ判定を仕込む:
 *   - Ctrl/Cmd+P → iframe 自身を print（＝プレビュー A4 のみ。PDF ボタンと同じ挙動）
 *   - Ctrl/Cmd+S → 親へ postMessage して保存を委譲（iframe から直接は保存できない）
 * source を固定文字列にして、親側 resolvePreviewMessage が他フレーム由来を弾けるようにする。
 */
const PREVIEW_SHORTCUT_SCRIPT = `<script>
(function () {
  function primary(e) { return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey; }
  window.addEventListener('keydown', function (e) {
    if (!primary(e)) return;
    var k = (e.key || '').toLowerCase();
    if (k === 'p') {
      e.preventDefault();
      window.print();
    } else if (k === 's') {
      e.preventDefault();
      parent.postMessage({ source: 'md-business-preview', action: 'save' }, '*');
    }
  });
})();
</script>`;

export function buildPreviewDocument(input: PreviewDocumentInput): string {
  const { bodyHtml, css, title = '', theme = 'light', lang = 'ja' } = input;

  return `<!doctype html>
<html lang="${escapeHtml(lang)}" data-theme="${escapeHtml(theme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>:root { color-scheme: ${escapeHtml(theme)}; }</style>
<style>${css}</style>
</head>
<body>
${bodyHtml}
${PREVIEW_SHORTCUT_SCRIPT}
</body>
</html>`;
}
