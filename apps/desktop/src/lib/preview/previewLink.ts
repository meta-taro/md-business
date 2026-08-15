/**
 * プレビュー内のリンクを、どう扱うかで分類する。
 *
 * プレビューは srcdoc の iframe なので、中のリンクを普通に押させると
 * 枠の中でページごと差し替わる（戻る手段が無い）。押されたリンクを親側で
 * 受け取って開き直すために、まず「何を指しているか」だけをここで決める。
 *
 * 追わないものは null を返す。null は「拒否した」ではなく「横取りしない」で、
 * 呼び出し側は既定の動きに任せる（同じ文書の中の移動がこれにあたる）。
 */
export type PreviewLink =
  | { kind: 'external'; href: string }
  | { kind: 'document'; path: string }
  /** 開かないが、既定の遷移もさせない（javascript: をその場で走らせないため）。 */
  | { kind: 'blocked'; href: string };

/** スキーム付き URL かどうか（`javascript:` `file:` `C:\…` もここに入る）。 */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HTTP_SCHEME = /^https?:\/\//i;

export function resolvePreviewLink(href: string): PreviewLink | null {
  const raw = href.trim();
  if (raw === '') return null;

  // 同じ文書の中の移動。ブラウザ既定のアンカー移動がそのまま正しい。
  if (raw.startsWith('#')) return null;

  if (HTTP_SCHEME.test(raw)) return { kind: 'external', href: raw };

  // http / https 以外のスキームは開かない。javascript: を既定に任せると、
  // 描画した文書がそのままアプリの操作権を持つ。
  if (SCHEME.test(raw)) return { kind: 'blocked', href: raw };

  // 「/」がワークスペースのルートなのか OS のルートなのかを決められない。
  if (raw.startsWith('/')) return { kind: 'blocked', href: raw };

  // 指し先だけを取る。プレビュー内の見出しジャンプは別の話なので落とす。
  const path = raw.split('#')[0].split('?')[0];
  if (path === '') return null;

  return { kind: 'document', path };
}
