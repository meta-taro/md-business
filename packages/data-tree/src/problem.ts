import type { DataProblem, DataProblemKind } from './types.js';

/**
 * A refusal in flight.
 *
 * The readers detect their limits deep inside a walk, where returning a result
 * would mean threading an error through every step. Throwing keeps the walking
 * code readable; each reader catches this at its entry point and hands back a
 * result, so nothing escapes to the caller as an exception.
 */
export class DataProblemError extends Error {
  readonly problem: DataProblem;

  constructor(kind: DataProblemKind, message: string, line?: number) {
    super(message);
    this.name = 'DataProblemError';
    this.problem = line === undefined ? { kind, message } : { kind, message, line };
  }
}

/** 1-based line number of an offset, for pointing at where reading stopped. */
export function lineOf(text: string, index: number): number {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/** Refuse input larger than the limit before any parser looks at it. */
export function checkSize(text: string, maxChars: number): void {
  if (text.length > maxChars) {
    throw new DataProblemError(
      'size',
      `This file is ${text.length} characters, past the ${maxChars} this reader accepts.`,
    );
  }
}
