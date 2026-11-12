/**
 * エージェントが「画面に見えている文字」で指したものを、窓の中の要素へ落とす。
 *
 * 依頼元は DOM を知らないので、人が読んでいる文字で指すしかない。曖昧な指定でも
 * 人の感覚に近いものを選ぶよう、完全一致 → 前方一致 → 部分一致 の順に見る。
 */

/** 指せる要素。押せる・打てる・行や見出しのように場所として指す価値があるもの。 */
const CANDIDATES =
  'button, a, input, select, textarea, [role="menuitem"], [role="menuitemradio"], [role="tab"], [data-trace], tr, h1, h2';

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 要素を人が何と呼ぶか。アイコンだけのボタンは aria-label / title が名前になる。 */
export function accessibleName(el: HTMLElement): string {
  const attr = (name: string): string => normalize(el.getAttribute(name) ?? '');
  for (const name of ['aria-label', 'title', 'placeholder']) {
    const value = attr(name);
    if (value !== '') return value;
  }
  const labels = (el as HTMLInputElement).labels;
  const label = labels?.[0]?.textContent;
  if (label) {
    const value = normalize(label);
    if (value !== '') return value;
  }
  return normalize(el.textContent ?? '');
}

export interface NamedCandidate<T> {
  name: string;
  el: T;
}

export function pickTarget<T>(
  candidates: readonly NamedCandidate<T>[],
  query: string,
): NamedCandidate<T> | null {
  const q = normalize(query);
  if (q === '') return null;
  return (
    candidates.find((c) => c.name === q) ??
    candidates.find((c) => c.name.startsWith(q)) ??
    candidates.find((c) => c.name.includes(q)) ??
    null
  );
}

/** 画面に出ているか。大きさが無いもの・隠されているものは人から見えない。 */
export function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

export function findTarget(
  root: ParentNode,
  query: string,
  visible: (el: HTMLElement) => boolean = isVisible,
): HTMLElement | null {
  const candidates = [...root.querySelectorAll<HTMLElement>(CANDIDATES)]
    // カーソル自身の吹き出しの × を指してしまわないよう外す。
    .filter((el) => el.closest('[data-agent-overlay]') === null && visible(el))
    .map((el) => ({ name: accessibleName(el), el }));
  return pickTarget(candidates, query)?.el ?? null;
}
