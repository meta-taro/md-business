import { countNode, type BuildState } from './budget.js';
import { resolveLimits, type DataLimits, type ResolvedDataLimits } from './limits.js';
import { DataProblemError, checkSize, lineOf } from './problem.js';
import type { DataAttribute, DataTreeNode, ReadDataResult } from './types.js';

/**
 * A non-validating XML reader that never resolves an entity it was not born
 * knowing.
 *
 * The usual way to read XML safely is to switch a library's entity handling
 * off. This reader has nothing to switch off: it refuses a document type
 * declaration outright and resolves only the five predefined entities and
 * numeric character references. Nothing else can be defined, so there is no
 * declaration to expand — neither the one that reads a local file nor the one
 * that expands to gigabytes from a few hundred bytes.
 *
 * A file that genuinely needs a DTD is refused with that as the stated reason,
 * rather than read with parts of it silently missing.
 */

/** Name given to text that has to keep its own row because it has siblings. */
const TEXT_NODE_NAME = '#text';

const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const NAME_END = new Set([' ', '\t', '\r', '\n', '/', '>', '=']);

/** Both of these take the position past the end of the text, which is neither. */
function isSpace(char: string | undefined): boolean {
  return char === ' ' || char === '\t' || char === '\r' || char === '\n';
}

function isNameEnd(char: string | undefined): boolean {
  return char === undefined || NAME_END.has(char);
}

interface OpenElement {
  node: DataTreeNode;
  /** Offset of the opening tag, so a tag left open can be pointed at. */
  at: number;
}

interface OpenedTag {
  node: DataTreeNode;
  next: number;
  selfClosing: boolean;
}

function syntaxAt(text: string, at: number, message: string): DataProblemError {
  return new DataProblemError('syntax', message, lineOf(text, at));
}

function resolveReference(name: string, text: string, at: number): string {
  const predefined = PREDEFINED_ENTITIES[name];
  if (predefined !== undefined) return predefined;

  const numeric = /^#(x)?([0-9a-fA-F]+)$/.exec(name);
  if (numeric !== null) {
    const code = Number.parseInt(numeric[2] ?? '', numeric[1] === undefined ? 10 : 16);
    try {
      return String.fromCodePoint(code);
    } catch {
      throw syntaxAt(text, at, `"&${name};" is not a character.`);
    }
  }

  throw new DataProblemError(
    'entity',
    `This file references the entity "${name}". Only "&amp;", "&lt;", "&gt;", ` +
      '"&quot;", "&apos;" and numeric references are resolved, because anything ' +
      'else would have to come from a document type declaration.',
    lineOf(text, at),
  );
}

/** Replace character references in one run of text or one attribute value. */
function decodeEntities(raw: string, text: string, at: number): string {
  if (!raw.includes('&')) return raw;

  let out = '';
  let i = 0;
  while (i < raw.length) {
    const amp = raw.indexOf('&', i);
    if (amp === -1) {
      out += raw.slice(i);
      break;
    }
    out += raw.slice(i, amp);
    const semicolon = raw.indexOf(';', amp + 1);
    const name = semicolon === -1 ? '' : raw.slice(amp + 1, semicolon);
    if (name === '' || /[\s<&]/.test(name)) {
      throw new DataProblemError(
        'entity',
        'An "&" here does not start a character reference. Write it as "&amp;".',
        lineOf(text, at + amp),
      );
    }
    out += resolveReference(name, text, at + amp);
    i = semicolon + 1;
  }
  return out;
}

function skipPast(text: string, start: number, terminator: string, unclosed: string): number {
  const end = text.indexOf(terminator, start);
  if (end === -1) throw syntaxAt(text, start, unclosed);
  return end + terminator.length;
}

function readAttributes(
  text: string,
  from: number,
  tagStart: number,
): { attributes: DataAttribute[]; next: number; selfClosing: boolean } {
  const attributes: DataAttribute[] = [];
  let i = from;

  for (;;) {
    while (isSpace(text[i])) i += 1;
    if (i >= text.length) throw syntaxAt(text, tagStart, 'A tag is never closed.');
    if (text[i] === '>') return { attributes, next: i + 1, selfClosing: false };
    if (text[i] === '/' && text[i + 1] === '>') {
      return { attributes, next: i + 2, selfClosing: true };
    }

    const nameStart = i;
    while (!isNameEnd(text[i])) i += 1;
    const name = text.slice(nameStart, i);
    if (name === '') throw syntaxAt(text, i, 'A tag holds something that is not an attribute.');

    while (isSpace(text[i])) i += 1;
    if (text[i] !== '=') throw syntaxAt(text, i, `The attribute "${name}" has no value.`);
    i += 1;
    while (isSpace(text[i])) i += 1;

    const quote = text[i];
    if (quote !== '"' && quote !== "'") {
      throw syntaxAt(text, i, `The value of "${name}" is not quoted.`);
    }
    const valueStart = i + 1;
    const valueEnd = text.indexOf(quote, valueStart);
    if (valueEnd === -1) throw syntaxAt(text, i, `The value of "${name}" is never closed.`);

    attributes.push({ name, value: decodeEntities(text.slice(valueStart, valueEnd), text, valueStart) });
    i = valueEnd + 1;
  }
}

function openElement(text: string, start: number, state: BuildState): OpenedTag {
  let i = start + 1;
  while (!isNameEnd(text[i])) i += 1;
  const name = text.slice(start + 1, i);
  if (name === '') {
    throw syntaxAt(text, start, 'A "<" here does not start a tag. Write it as "&lt;".');
  }

  const { attributes, next, selfClosing } = readAttributes(text, i, start);
  countNode(state);
  const node: DataTreeNode = { name, children: [] };
  if (attributes.length > 0) node.attributes = attributes;
  return { node, next, selfClosing };
}

/**
 * Fold an element whose only content is text into a single row.
 *
 * Text that has element siblings keeps its own node, because moving it into the
 * parent would lose where it sat between them.
 */
function foldTextOnlyElement(node: DataTreeNode): void {
  if (node.children.length !== 1) return;
  const only = node.children[0];
  if (only === undefined || only.name !== TEXT_NODE_NAME || only.value === undefined) return;
  node.value = only.value;
  node.children = [];
}

function closeElement(text: string, start: number, stack: OpenElement[]): number {
  const close = text.indexOf('>', start);
  if (close === -1) throw syntaxAt(text, start, 'A closing tag is never finished.');
  const name = text.slice(start + 2, close).trim();

  const open = stack.pop();
  if (open === undefined) {
    throw syntaxAt(text, start, `</${name}> closes an element that was never opened.`);
  }
  if (open.node.name !== name) {
    throw syntaxAt(text, start, `</${name}> does not close <${open.node.name}>.`);
  }
  foldTextOnlyElement(open.node);
  return close + 1;
}

/**
 * Add a run of text.
 *
 * Whitespace between tags is what indents the file, not content, so it is
 * dropped. Anything else outside the root element is a malformed document
 * rather than something to show.
 */
function appendText(
  content: string,
  stack: OpenElement[],
  state: BuildState,
  text: string,
  at: number,
): void {
  if (content.trim() === '') return;
  const parent = stack[stack.length - 1];
  if (parent === undefined) {
    throw syntaxAt(text, at, 'This file holds text outside its root element.');
  }
  countNode(state);
  parent.node.children.push({ name: TEXT_NODE_NAME, value: content, children: [] });
}

function refuseDeclaration(text: string, at: number): DataProblemError {
  if (text.startsWith('<!DOCTYPE', at)) {
    return new DataProblemError(
      'doctype',
      'This file carries a document type declaration. It is not read, because ' +
        'reading one can pull in other files and can expand a small file into a ' +
        'very large one.',
      lineOf(text, at),
    );
  }
  return syntaxAt(text, at, 'This file holds markup this reader does not read.');
}

function parseDocument(text: string, limits: ResolvedDataLimits): DataTreeNode {
  const state: BuildState = { count: 0, limits };
  const stack: OpenElement[] = [];
  let root: DataTreeNode | null = null;
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '<') {
      const nextTag = text.indexOf('<', i);
      const end = nextTag === -1 ? text.length : nextTag;
      appendText(decodeEntities(text.slice(i, end), text, i), stack, state, text, i);
      i = end;
      continue;
    }

    if (text.startsWith('<!--', i)) {
      i = skipPast(text, i, '-->', 'A comment is never closed.');
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const close = text.indexOf(']]>', i);
      if (close === -1) throw syntaxAt(text, i, 'A CDATA section is never closed.');
      appendText(text.slice(i + '<![CDATA['.length, close), stack, state, text, i);
      i = close + ']]>'.length;
      continue;
    }
    if (text.startsWith('<!', i)) throw refuseDeclaration(text, i);
    if (text.startsWith('<?', i)) {
      i = skipPast(text, i, '?>', 'A processing instruction is never closed.');
      continue;
    }
    if (text.startsWith('</', i)) {
      i = closeElement(text, i, stack);
      continue;
    }

    const opened = openElement(text, i, state);
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      if (root !== null) {
        throw syntaxAt(text, i, 'A document holds one root element; this file has a second.');
      }
      root = opened.node;
    } else {
      parent.node.children.push(opened.node);
    }
    if (!opened.selfClosing) {
      stack.push({ node: opened.node, at: i });
      if (stack.length > limits.maxDepth) {
        throw new DataProblemError(
          'depth',
          `This file nests past the ${limits.maxDepth} levels this reader accepts.`,
          lineOf(text, i),
        );
      }
    }
    i = opened.next;
  }

  const unclosed = stack.pop();
  if (unclosed !== undefined) {
    throw syntaxAt(text, unclosed.at, `<${unclosed.node.name}> is never closed.`);
  }
  if (root === null) throw syntaxAt(text, text.length, 'This file has no element in it.');
  return root;
}

/** Read XML into the displayed tree. */
export function readXmlTree(text: string, limits: DataLimits = {}): ReadDataResult {
  const resolved = resolveLimits(limits);
  try {
    checkSize(text, resolved.maxChars);
    return { ok: true, format: 'xml', root: parseDocument(text, resolved) };
  } catch (error) {
    if (error instanceof DataProblemError) {
      return { ok: false, format: 'xml', problem: error.problem };
    }
    throw error;
  }
}
