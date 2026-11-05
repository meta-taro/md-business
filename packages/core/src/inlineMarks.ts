/**
 * 文中の飾り（マーカー・下線・文字色）を、決めた形のものだけ要素にする。
 *
 * 本文の生の HTML は既定で落とす。全部を通せば script も通るので、通すのは
 * `<mark>` `<u>` と、文字色だけを指定した `<span style="color:…">` に限る。
 * 色の値は形を確かめてから書き直す（`expression(...)` や `url(...)` を通さない）。
 *
 * `==文==` は読み上げ用の印として使われる。社内で使う印なので、
 * 提出版（`highlight: false`）では印を外して文字だけ残す。`<mark>` も同じ扱い。
 */

/** mdast のうち、ここで触るぶんだけの形。 */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
}

/** 決めた形の飾りを表す節。`data.hName` を見て remark-rehype が要素にする。 */
const INLINE_TYPE = 'mdbInline';
type InlineKind = 'mark' | 'u' | 'color';

const OPEN_SIMPLE = /^<(u|mark)\s*>$/i;
const OPEN_SPAN = /^<span\s+style\s*=\s*(["'])\s*color\s*:\s*([^;"']+?)\s*;?\s*\1\s*>$/i;
const OPEN_ANY = /^<(u|mark|span)(?:\s[^>]*)?>$/i;
const CLOSE = /^<\/(u|mark|span)\s*>$/i;

/** 色として受ける形。名前・#16 進・rgb()/rgba() だけ。 */
const COLOR =
  /^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{3,20}|rgba?\(\s*\d{1,3}%?\s*(?:,\s*\d{1,3}%?\s*){2}(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i;

function inlineNode(kind: InlineKind, color?: string): MdNode {
  const hast =
    kind === 'mark'
      ? { hName: 'mark', hProperties: { className: ['mdb-mark'] } }
      : kind === 'u'
        ? { hName: 'u' }
        : { hName: 'span', hProperties: { style: `color: ${color}` } };
  return { type: INLINE_TYPE, data: { ...hast, mdbKind: kind }, children: [] };
}

interface OpenTag {
  tag: string;
  /** 通さない形の開きタグ。閉じと対にするためだけに積む。 */
  node: MdNode | null;
  container: MdNode[];
}

/** 開きタグと閉じタグの間を飾りの節で包む。閉じていなければ包まない。 */
function pairTags(parent: MdNode): void {
  const children = parent.children;
  if (children === undefined || !children.some((c) => c.type === 'html')) return;

  const root: MdNode[] = [];
  const stack: OpenTag[] = [];
  const current = (): MdNode[] => stack.findLast((s) => s.node !== null)?.node?.children ?? root;

  for (const child of children) {
    const raw = child.type === 'html' ? (child.value ?? '').trim() : null;
    if (raw === null) {
      current().push(child);
      continue;
    }
    const close = CLOSE.exec(raw);
    if (close !== null) {
      const tag = close[1]!.toLowerCase();
      if (stack[stack.length - 1]?.tag === tag) stack.pop();
      else current().push(child);
      continue;
    }
    const simple = OPEN_SIMPLE.exec(raw);
    const span = OPEN_SPAN.exec(raw);
    const node =
      simple !== null
        ? inlineNode(simple[1]!.toLowerCase() as InlineKind)
        : span !== null && COLOR.test(span[2]!)
          ? inlineNode('color', span[2]!)
          : null;
    const any = OPEN_ANY.exec(raw);
    if (node === null && any === null) {
      current().push(child);
      continue;
    }
    const container = current();
    if (node !== null) container.push(node);
    stack.push({ tag: (any?.[1] ?? simple?.[1] ?? 'span').toLowerCase(), node, container });
  }

  // 閉じなかったものは包みを外して、中身を元の場所へ戻す。
  for (const open of stack.reverse()) {
    if (open.node === null) continue;
    const at = open.container.indexOf(open.node);
    open.container.splice(at, 1, ...(open.node.children ?? []));
  }
  parent.children = root;
}

const SPACE = /\s/;

interface Piece {
  node: MdNode;
  /** `==` のときだけ。開きになれるか・閉じになれるか。 */
  canOpen?: boolean;
  canClose?: boolean;
}

/** 同じ並びの中の `==` と `==` を対にして包む。 */
function pairMarks(parent: MdNode): void {
  const children = parent.children;
  if (children === undefined || !children.some((c) => c.type === 'text' && c.value?.includes('=='))) {
    return;
  }

  const pieces: Piece[] = [];
  children.forEach((child, index) => {
    if (child.type !== 'text' || !child.value?.includes('==')) {
      pieces.push({ node: child });
      return;
    }
    const parts = child.value.split(/(=+)/);
    parts.forEach((part, i) => {
      if (part === '') return;
      if (part !== '==') {
        pieces.push({ node: { type: 'text', value: part } });
        return;
      }
      // 隣の文字。文字の節の端なら、隣の節があれば文字があるとみなす（`==**a**==`）。
      const before = parts.slice(0, i).join('').slice(-1) || (index > 0 ? 'x' : ' ');
      const after = parts.slice(i + 1).join('').charAt(0) || (index < children.length - 1 ? 'x' : ' ');
      pieces.push({
        node: { type: 'text', value: part },
        canOpen: !SPACE.test(after),
        canClose: !SPACE.test(before),
      });
    });
  });

  const out: MdNode[] = [];
  let open: { at: number; piece: Piece } | null = null;
  for (const piece of pieces) {
    if (open === null && piece.canOpen === true) {
      open = { at: out.length, piece };
      out.push(piece.node);
      continue;
    }
    if (open !== null && piece.canClose === true) {
      const mark = inlineNode('mark');
      mark.children = out.splice(open.at).slice(1);
      out.push(mark);
      open = null;
      continue;
    }
    out.push(piece.node);
  }
  parent.children = out;
}

function walk(node: MdNode, visit: (node: MdNode) => void): void {
  for (const child of node.children ?? []) walk(child, visit);
  visit(node);
}

/** マーカーを外す（提出版）。中の文字はそのまま残す。 */
function unwrapMarks(node: MdNode): void {
  const children = node.children;
  if (children === undefined) return;
  node.children = children.flatMap((child) => {
    unwrapMarks(child);
    return child.type === INLINE_TYPE && child.data?.['mdbKind'] === 'mark' ? (child.children ?? []) : [child];
  });
}

export function remarkInlineMarks(options: { highlight: boolean }) {
  return () => (tree: unknown): void => {
    const root = tree as MdNode;
    walk(root, pairTags);
    walk(root, pairMarks);
    if (!options.highlight) unwrapMarks(root);
  };
}
