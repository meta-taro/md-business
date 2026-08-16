import { describe, it, expect } from 'vitest';
import {
  findDepthOverflow,
  findStructureOverflow,
  depthValidationError,
  MAX_FRONTMATTER_DEPTH,
  MAX_FRONTMATTER_NODES,
} from '../src/depth.js';

/** Build `{ of: { of: { ... } } }` nested `levels` deep. */
function nest(levels: number): Record<string, unknown> {
  let node: Record<string, unknown> = { type: 'string' };
  for (let i = 0; i < levels; i += 1) {
    node = { type: 'array', of: node };
  }
  return node;
}

describe('findDepthOverflow', () => {
  it('returns null for scalars and empty containers', () => {
    expect(findDepthOverflow('text')).toBeNull();
    expect(findDepthOverflow(42)).toBeNull();
    expect(findDepthOverflow(null)).toBeNull();
    expect(findDepthOverflow({})).toBeNull();
    expect(findDepthOverflow([])).toBeNull();
  });

  it('returns null for structures within the limit', () => {
    expect(findDepthOverflow(nest(MAX_FRONTMATTER_DEPTH - 2))).toBeNull();
  });

  it('reports the path of the first node past the limit', () => {
    // maxDepth 2 admits the root and one level below it; `b` is the third.
    const path = findDepthOverflow({ a: { b: { c: {} } } }, 2);
    expect(path).toBe('a.b');
  });

  it('indexes array elements in the reported path', () => {
    const path = findDepthOverflow({ list: [{ deep: {} }] }, 2);
    expect(path).toBe('list[0]');
  });

  it('flags a structure deeper than the default limit', () => {
    expect(findDepthOverflow(nest(MAX_FRONTMATTER_DEPTH + 5))).not.toBeNull();
  });

  // The guard exists to keep hostile input from overflowing the stack, so the
  // guard itself must not recurse. A depth no recursive walker could survive
  // has to come back as a plain result, not a RangeError.
  it('survives input far deeper than the JS call stack allows', () => {
    expect(() => findDepthOverflow(nest(200_000))).not.toThrow();
    expect(findDepthOverflow(nest(200_000))).not.toBeNull();
  });

  // YAML anchors can produce a self-referential object. Following it forever
  // would hang; exceeding the depth limit ends the walk.
  it('terminates on a self-referential object', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(findDepthOverflow(cyclic)).not.toBeNull();
  });
});

/**
 * Build the structure a chained-alias YAML block expands to: every level is an
 * array holding `fanout` references to the level below. Aliases share one
 * object, so this costs almost nothing to build while describing `fanout ** levels`
 * distinct paths.
 */
function fanoutChain(levels: number, fanout: number): unknown {
  let node: unknown = ['x'];
  for (let i = 0; i < levels; i += 1) {
    node = Array.from({ length: fanout }, () => node);
  }
  return node;
}

/** How much of a `fanoutChain` the caller actually touched. */
interface CountedChain {
  value: unknown;
  reads: () => number;
}

/**
 * A `fanoutChain` that counts every read the walker makes against it.
 *
 * "The budget stopped the walk early" cannot be stated as elapsed time — a
 * shared machine can be slow for reasons that have nothing to do with this
 * code, and a threshold loose enough never to misfire is loose enough to pass
 * with no budget at all. Counting reads states the same claim as a number that
 * depends only on the algorithm.
 */
function countedFanoutChain(levels: number, fanout: number): CountedChain {
  let reads = 0;
  const counted = <T extends object>(node: T): T =>
    new Proxy(node, {
      get(target, key, receiver) {
        reads += 1;
        return Reflect.get(target, key, receiver);
      },
    });

  let node: unknown = counted(['x']);
  for (let i = 0; i < levels; i += 1) {
    const below = node;
    node = counted(Array.from({ length: fanout }, () => below));
  }
  return { value: node, reads: () => reads };
}

describe('findStructureOverflow', () => {
  it('returns null for a structure within both limits', () => {
    expect(findStructureOverflow({ a: { b: [{ c: 1 }] } })).toBeNull();
  });

  it('reports depth overflow with the offending path', () => {
    expect(findStructureOverflow({ a: { b: { c: {} } } }, { maxDepth: 2 })).toEqual({
      kind: 'depth',
      path: 'a.b',
    });
  });

  // The walk is the expensive part of parsing, so it has to be the thing that
  // gives up. A structure whose distinct paths outnumber the budget is hostile
  // regardless of how shallow it is.
  it('reports node overflow for a wide structure that stays shallow', () => {
    const overflow = findStructureOverflow(fanoutChain(8, 12));
    expect(overflow?.kind).toBe('nodes');
  });

  it('stops within the node budget instead of walking the whole expansion', () => {
    // 12 ** 8 is ~430 million positions. The budget stops the walk at roughly
    // half a million reads; a walk of the whole expansion needs a few million
    // for a structure a thousand times smaller than this one.
    const chain = countedFanoutChain(8, 12);
    expect(findStructureOverflow(chain.value)).not.toBeNull();
    expect(chain.reads()).toBeLessThan(MAX_FRONTMATTER_NODES * 10);
  });

  it('accepts a structure just under the node budget', () => {
    const wide = { rows: Array.from({ length: 1_000 }, (_, i) => ({ id: i })) };
    expect(findStructureOverflow(wide)).toBeNull();
    expect(MAX_FRONTMATTER_NODES).toBeGreaterThan(1_000);
  });
});

describe('findDepthOverflow node budget', () => {
  // `findDepthOverflow` is exported on its own, so callers that reach for it
  // directly must get the same protection as the ones going through
  // `depthValidationError`.
  it('reports an overflow for a structure past the node budget', () => {
    const chain = countedFanoutChain(8, 12);
    expect(findDepthOverflow(chain.value)).not.toBeNull();
    expect(chain.reads()).toBeLessThan(MAX_FRONTMATTER_NODES * 10);
  });
});

describe('depthValidationError', () => {
  it('returns null for structures within the limit', () => {
    expect(depthValidationError({ a: { b: 1 } })).toBeNull();
    expect(depthValidationError('text')).toBeNull();
  });

  it('reports the offending node as a JSON Pointer, like the schema validator', () => {
    const error = depthValidationError({ list: [{ deep: { deeper: {} } }] }, 2);
    expect(error).toEqual({
      path: '/list/0',
      message: 'Frontmatter is nested deeper than 2 levels.',
      keyword: 'maxDepth',
    });
  });

  it('mentions the default limit when none is given', () => {
    const error = depthValidationError(nest(MAX_FRONTMATTER_DEPTH + 5));
    expect(error?.message).toContain(String(MAX_FRONTMATTER_DEPTH));
  });

  // A node-count overflow is not a depth problem, and saying "nested too deep"
  // about a two-level structure would send the author looking in the wrong
  // place.
  it('distinguishes a node-count overflow from a depth overflow', () => {
    const error = depthValidationError(fanoutChain(8, 12));
    expect(error?.keyword).toBe('maxNodes');
    expect(error?.message).toContain(String(MAX_FRONTMATTER_NODES));
    expect(error?.message).not.toMatch(/deeper/i);
  });
});
