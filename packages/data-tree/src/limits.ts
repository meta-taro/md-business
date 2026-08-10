/**
 * Bounds on what a data file may describe.
 *
 * All three exist because a small file can describe a large amount of work.
 * Size alone does not bound nesting (a few hundred bytes of brackets nest
 * thousands deep), nesting does not bound breadth (a flat array of a million
 * numbers is two levels deep), and neither bounds the tree that gets built from
 * them. Each limit is checked at the point where exceeding it would otherwise
 * stop being recoverable: size before parsing, depth before descending, node
 * count as nodes are created.
 */

/** Characters accepted in one file. Larger inputs are refused unparsed. */
export const MAX_DATA_CHARS = 4_000_000;

/**
 * Container nesting accepted. Matches the frontmatter limit, so a structure is
 * bounded the same way whichever format carries it. Business data nests a
 * handful of levels; anything near this is malformed or hostile.
 */
export const MAX_DATA_DEPTH = 100;

/**
 * Tree nodes accepted. Counted as nodes are created rather than after the fact,
 * so refusing costs the budget rather than the whole file.
 */
export const MAX_DATA_NODES = 200_000;

export interface DataLimits {
  maxChars?: number;
  maxDepth?: number;
  maxNodes?: number;
}

export type ResolvedDataLimits = Required<DataLimits>;

export function resolveLimits(limits: DataLimits = {}): ResolvedDataLimits {
  return {
    maxChars: limits.maxChars ?? MAX_DATA_CHARS,
    maxDepth: limits.maxDepth ?? MAX_DATA_DEPTH,
    maxNodes: limits.maxNodes ?? MAX_DATA_NODES,
  };
}
