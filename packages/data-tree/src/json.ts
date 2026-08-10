import { countNode, type BuildState } from './budget.js';
import { resolveLimits, type DataLimits } from './limits.js';
import { DataProblemError, checkSize } from './problem.js';
import type { DataTreeNode, DataValueType, ReadDataResult } from './types.js';

/**
 * Deepest container nesting the text describes.
 *
 * Measured on the text rather than on the parsed value because `JSON.parse`
 * descends recursively: a deeply nested file exhausts the call stack inside the
 * parser, and what comes back is a stack overflow rather than an answer. Reading
 * the brackets first costs one pass and lets an over-nested file be refused for
 * the reason it was actually refused.
 *
 * Strings are skipped, so brackets inside them do not count.
 */
function textDepth(text: string): number {
  let depth = 0;
  let max = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') {
      depth += 1;
      if (depth > max) max = depth;
    } else if (ch === '}' || ch === ']') depth -= 1;
  }
  return max;
}

function valueTypeOf(value: unknown): DataValueType {
  if (value === null) return 'null';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function build(name: string, value: unknown, state: BuildState): DataTreeNode {
  countNode(state);

  if (Array.isArray(value)) {
    return { name, children: value.map((child, i) => build(String(i), child, state)) };
  }
  if (typeof value === 'object' && value !== null) {
    return {
      name,
      children: Object.entries(value).map(([key, child]) => build(key, child, state)),
    };
  }
  return { name, value: String(value), valueType: valueTypeOf(value), children: [] };
}

/**
 * Read JSON into the displayed tree.
 *
 * Numbers are shown as JavaScript renders them, so a value written with more
 * precision than a double carries comes back rounded. That is visible in the
 * tree rather than silently corrected, and nothing is written back from here.
 */
export function readJsonTree(text: string, limits: DataLimits = {}): ReadDataResult {
  const resolved = resolveLimits(limits);
  try {
    checkSize(text, resolved.maxChars);

    const depth = textDepth(text);
    if (depth > resolved.maxDepth) {
      throw new DataProblemError(
        'depth',
        `This file nests ${depth} levels deep, past the ${resolved.maxDepth} this reader accepts.`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch (error) {
      throw new DataProblemError(
        'syntax',
        error instanceof Error ? error.message : 'This file is not valid JSON.',
      );
    }

    return { ok: true, format: 'json', root: build('', parsed, { count: 0, limits: resolved }) };
  } catch (error) {
    if (error instanceof DataProblemError) {
      return { ok: false, format: 'json', problem: error.problem };
    }
    throw error;
  }
}
