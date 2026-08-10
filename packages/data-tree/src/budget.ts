import type { ResolvedDataLimits } from './limits.js';
import { DataProblemError } from './problem.js';

/** Node budget shared by both readers, spent as the tree is built. */
export interface BuildState {
  count: number;
  limits: ResolvedDataLimits;
}

export function countNode(state: BuildState): void {
  state.count += 1;
  if (state.count > state.limits.maxNodes) {
    throw new DataProblemError(
      'nodes',
      `This file describes more than the ${state.limits.maxNodes} values this reader shows.`,
    );
  }
}
