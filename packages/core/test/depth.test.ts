import { describe, it, expect } from 'vitest';
import {
  findDepthOverflow,
  depthValidationError,
  MAX_FRONTMATTER_DEPTH,
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
});
