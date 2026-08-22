/**
 * 検証シート（カスタム TSV）の下見プレビュー provider。
 *
 * ほかの 7 スキーマと違い、これは frontmatter で見分ける Markdown ではない。
 * 先頭のマジック行で判定した `.tsv` を、画面のグリッドとは別の「紙の版面」として描く。
 * だから createSchemaPreview（normalize → validate → renderBody）には載せず、
 * 断片づくりだけを renderer-pdf に任せて、あとは Markdown フォールバックと同じ形で組む。
 *
 * ここを通しておくと、画面の下見・[PDF]・[HTML]・[画像] がすべて同じ 1 本の
 * 組み立てを見る。別経路で組むと、画面で確かめたものと人へ渡すものが食い違う。
 */
import { renderTestSpecTsvBody } from '@md-business/renderer-pdf';
import testSpecTsvCss from '@md-business/renderer-pdf/styles/test-spec-tsv.css?raw';
import { loadGridDoc } from '../../tsv/gridDoc';
import { buildSheetPrintDoc } from '../../tsv/sheetPrint';
import { buildPreviewDocument } from '../previewDocument';
import type { PreviewOk, PreviewStyle, RenderPreviewOptions } from '../previewFactory';

/** 検証シートの書式 ID（CSS ファイル名のもと）。 */
const TEST_SPEC_TSV_STYLE_ID = 'test-spec-tsv';

/** メタに題名が無いシートの呼び名。空の見出しで刷らないための既定値。 */
const FALLBACK_TITLE = '検証シート';

/** 検証シートの書式。静的サイト出力が CSS を 1 本にまとめるために要る。 */
export const TEST_SPEC_TSV_STYLE: PreviewStyle = {
  id: TEST_SPEC_TSV_STYLE_ID,
  css: testSpecTsvCss,
};

/**
 * カスタム TSV の生ソースを下見用の完全な HTML 文書として描く。
 *
 * 控え行と行 ID の列は loadGridDoc が外す（＝紙にも出ない）。表に出していないものが
 * 刷り上がりにだけ現れると、渡した相手には消したはずのものが見える。
 */
export function renderSheetPreview(
  source: string,
  options: RenderPreviewOptions = {},
): PreviewOk {
  const doc = buildSheetPrintDoc(loadGridDoc(source).doc, { fallbackTitle: FALLBACK_TITLE });

  return {
    ok: true,
    srcdoc: buildPreviewDocument({
      bodyHtml: renderTestSpecTsvBody(doc),
      css: testSpecTsvCss,
      cssHref: options.cssHref?.(TEST_SPEC_TSV_STYLE_ID),
      title: doc.title,
      theme: options.theme,
      shortcuts: options.shortcuts,
    }),
    style: TEST_SPEC_TSV_STYLE,
    documentTitle: doc.title,
    label: FALLBACK_TITLE,
    warnings: [],
    errors: [],
  };
}
