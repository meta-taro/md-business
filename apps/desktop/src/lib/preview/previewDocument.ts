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
  /**
   * CSS を埋め込まず、この URL の外部スタイルシートとして読ませる。
   *
   * 渡すのは静的サイト出力だけ。1 ファイルで完結させたい画面プレビューと単一 HTML
   * 書き出しは埋め込みのままにする（外部参照にすると、送った先で CSS が欠けた
   * 素の HTML になる）。逆にページが何十枚もあるサイトでは、同じ CSS を全ページへ
   * 複製すると出力が膨らみ、直したいときも 1 枚ずつ直すことになる。
   */
  cssHref?: string;
  /** ドキュメントタイトル（<title>）。escape される。 */
  title?: string;
  /** iframe 内 <html data-theme>。アプリのテーマと一致させる。既定 light。 */
  theme?: PreviewTheme;
  /** <html lang>。既定 'ja'。 */
  lang?: string;
  /**
   * iframe 内ショートカット横取りスクリプトを入れるか。既定 true。
   *
   * false にするのはアプリの外へ出す HTML（ファイル書き出し・Web 公開）。あのスクリプトは
   * 「親フレームがアプリである」ことを前提にした仕掛けなので、受け取った人がブラウザで
   * 開いたときには、印刷と検索を横取りするだけの邪魔者になる。
   */
  shortcuts?: boolean;
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
 *   - Ctrl/Cmd+F → 親へ postMessage して共通 SearchBar をプレビュー対象で開く（ネイティブの
 *     WebView 検索ではなくアプリ統一の検索バーを使う。ハイライトは親が contentDocument を
 *     直接操作して行う＝same-origin srcdoc なのでフレーム越しに到達できる）
 *   - Ctrl/Cmd + = / + / ; / - / 0 と Ctrl/Cmd+ホイール → 親へ倍率の変更を渡す（倍率は親が
 *     持ち、ヘッダのボタンと同じ値を動かす。ここで決めると、ボタンとずれる）
 * source を固定文字列にして、親側 resolvePreviewMessage が他フレーム由来を弾けるようにする。
 */
const PREVIEW_SHORTCUT_SCRIPT = `<script>
(function () {
  function primary(e) { return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey; }
  function post(action) { parent.postMessage({ source: 'md-business-preview', action: action }, '*'); }
  function zoomKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
    if (e.key === '=' || e.key === '+' || e.key === ';') return 'zoomIn';
    if (e.shiftKey) return null;
    if (e.key === '-') return 'zoomOut';
    if (e.key === '0') return 'zoomReset';
    return null;
  }
  window.addEventListener('keydown', function (e) {
    var zoom = zoomKey(e);
    if (zoom) {
      e.preventDefault();
      post(zoom);
      return;
    }
    if (!primary(e)) return;
    var k = (e.key || '').toLowerCase();
    if (k === 'p') {
      e.preventDefault();
      post('pdf');
    } else if (k === 's') {
      e.preventDefault();
      post('save');
    } else if (k === 'f') {
      e.preventDefault();
      post('find');
    }
  });
  // 既定のままだとページ全体（アプリの枠ごと）が拡大される。止めるには passive を外す。
  // トラックパッドのピンチは細かい wheel を連続で出すので、間を空けて 1 段ずつにする。
  var lastWheel = 0;
  window.addEventListener('wheel', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.deltaY === 0) return;
    e.preventDefault();
    if (e.timeStamp - lastWheel < 80) return;
    lastWheel = e.timeStamp;
    post(e.deltaY < 0 ? 'zoomIn' : 'zoomOut');
  }, { passive: false });
})();
</script>`;

/**
 * 表示倍率。値は親が `--preview-zoom` に入れる。
 * 画面の上だけに効かせる（印刷＝PDF は A4 の正本なので、倍率に関わらず 100% で刷る）。
 */
const PREVIEW_ZOOM_STYLE = '<style>@media screen { html { zoom: var(--preview-zoom, 1); } }</style>';

/**
 * 本のように読む画面（見開き）。`<html class="mdb-book">` のときだけ効く。
 *
 * 本文を CSS の段組みで割り、1 段を 1 ページとして横へ並べ、変形でずらしてめくる。
 * 寸法はすべて親（bookReader）が px で変数に入れる。`vh` を使わないのは、倍率（zoom）を
 * 掛けた文書の中では `vh` が窓の高さとずれるため。
 *
 * 文書の CSS は body に幅や余白を付けていることがあるので、ここだけ `!important` で上書きする。
 * 切り替えは class だけで済むので、モードを変えても srcdoc を組み直さない（読んでいた位置が残る）。
 * 画面の上だけに効かせる（印刷＝PDF は今までどおり縦に流す）。
 */
const BOOK_STYLE = `<style>@media screen {
html.mdb-book { overflow: hidden !important; }
html.mdb-book body {
  box-sizing: border-box !important;
  margin: 0 !important;
  width: auto !important;
  max-width: none !important;
  height: var(--book-height) !important;
  padding: var(--book-pad-y) var(--book-pad-x) !important;
  column-count: var(--book-columns);
  column-gap: var(--book-gap);
  column-fill: auto;
  overflow: visible !important;
  transform: translateX(calc(var(--book-shift, 0) * -1px));
  transition: transform .28s ease;
}
html.mdb-book pre, html.mdb-book table, html.mdb-book figure, html.mdb-book .mermaid { break-inside: avoid; }
html.mdb-book img, html.mdb-book svg, html.mdb-book video, html.mdb-book canvas {
  max-width: 100%;
  max-height: calc(var(--book-height) - var(--book-pad-y) * 2);
  object-fit: contain;
  break-inside: avoid;
}
html.mdb-book .mdb-book-page {
  position: fixed; left: 50%; bottom: 6px; transform: translateX(-50%);
  font: 12px/1.4 system-ui, sans-serif; opacity: .55; pointer-events: none;
}
}</style>`;

/**
 * 印刷のとき、上下の余白へ空の欄を置く。
 *
 * WebView の印刷は、余白に日時・題・URL（`tauri.localhost`）・ページ番号を自分で刷り込む。
 * 印刷ダイアログで外せるが、既定が「刷る」なので、黙って PDF に残る。
 * 余白を 0 にした 1 ページ目にだけ出ないので、2 ページ目以降を開くまで気づけない。
 *
 * 文書の側が同じ辺に欄（`@top-center` など）を持つと、WebView は自分のものを刷らない。
 * 中身の無い欄を置いて、それを使う。文書の CSS より前に置くので、文書が自分の欄
 * （ページ番号など）を書けばそちらが勝つ。
 */
const PRINT_MARGIN_STYLE =
  "<style>@media print { @page { @top-center { content: ''; } @bottom-center { content: ''; } } }</style>";

export function buildPreviewDocument(input: PreviewDocumentInput): string {
  const {
    bodyHtml,
    css,
    cssHref,
    title = '',
    theme = 'light',
    lang = 'ja',
    shortcuts = true,
  } = input;
  const script = shortcuts ? `\n${PREVIEW_SHORTCUT_SCRIPT}` : '';
  const style =
    cssHref === undefined
      ? `<style>${css}</style>`
      : `<link rel="stylesheet" href="${escapeHtml(cssHref)}">`;

  return `<!doctype html>
<html lang="${escapeHtml(lang)}" data-theme="${escapeHtml(theme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>:root { color-scheme: ${escapeHtml(theme)}; }</style>
${PRINT_MARGIN_STYLE}
${style}${shortcuts ? `
${PREVIEW_ZOOM_STYLE}
${BOOK_STYLE}` : ''}
</head>
<body>
${bodyHtml}${script}
</body>
</html>`;
}
