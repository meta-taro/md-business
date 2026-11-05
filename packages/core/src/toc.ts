/**
 * 見出しから目次を作り、文書の頭に置く。
 *
 * 項目は各見出しの id へのリンクにする。id は見出しを付けたあとに読むので、
 * 同じ名前の見出しの枝番（`#画面-1`）もそのまま指せる。PDF でも同じ id へ飛ぶ。
 *
 * 載せるのは h1〜h3 まで。それより深い見出しまで並べると、目次が本文より長くなる。
 * 注釈の見出しは文書の章ではないので載せない。
 */

/** hast のうち、ここで触るぶんだけの形。 */
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** 文書の言語ごとの見出し。 */
export const TOC_LABEL: Record<string, string> = {
  ja: '目次',
  en: 'Contents',
  zh: '目录',
  ko: '목차',
};

const TOC_HEADING = /^h([1-3])$/;

interface TocEntry {
  level: number;
  id: string;
  text: string;
}

function collect(node: HastNode, textOf: (node: HastNode) => string, out: TocEntry[]): void {
  // 注釈のまとまり（`section[data-footnotes]`）の中は見ない。
  if (node.tagName === 'section' && node.properties?.['dataFootnotes'] !== undefined) return;
  const level = TOC_HEADING.exec(node.tagName ?? '')?.[1];
  const id = node.properties?.['id'];
  if (node.type === 'element' && level !== undefined && typeof id === 'string') {
    const text = textOf(node).trim();
    if (text !== '') out.push({ level: Number(level), id, text });
    return;
  }
  for (const child of node.children ?? []) collect(child, textOf, out);
}

const element = (tagName: string, properties: Record<string, unknown>, children: HastNode[]): HastNode => ({
  type: 'element',
  tagName,
  properties,
  children,
});

export function rehypeToc(label: string, textOf: (node: HastNode) => string) {
  return () => (tree: unknown): void => {
    const root = tree as HastNode;
    const entries: TocEntry[] = [];
    collect(root, textOf, entries);
    if (entries.length === 0) return;

    const items = entries.map((entry) =>
      element('li', { className: ['mdb-toc__item', `mdb-toc__item--${entry.level}`] }, [
        element('a', { href: `#${entry.id}` }, [{ type: 'text', value: entry.text }]),
      ]),
    );
    const nav = element('nav', { className: ['mdb-toc'], ariaLabel: label }, [
      element('p', { className: ['mdb-toc__head'] }, [{ type: 'text', value: label }]),
      element('ul', { className: ['mdb-toc__list'] }, items),
    ]);
    root.children = [nav, ...(root.children ?? [])];
  };
}
