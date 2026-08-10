import { readJsonTree } from './json.js';
import type { DataLimits } from './limits.js';
import { readXmlTree } from './xml.js';
import type { DataFormat, ReadDataResult } from './types.js';

/**
 * Which reader a file name asks for, or `null` when this package does not read it.
 *
 * Decided by extension alone. Sniffing the content would let a file be read as
 * something other than what it is named, and every caller here already knows
 * the name.
 */
export function detectDataFormat(fileName: string): DataFormat | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
  if (match === null) return null;
  const extension = match[1]?.toLowerCase();
  if (extension === 'json') return 'json';
  if (extension === 'xml') return 'xml';
  return null;
}

/** Read a data file, choosing the reader from its name. */
export function readDataFile(
  fileName: string,
  text: string,
  limits: DataLimits = {},
): ReadDataResult {
  const format = detectDataFormat(fileName);
  if (format === null) {
    return {
      ok: false,
      format: null,
      problem: {
        kind: 'unsupported',
        message: `"${fileName}" is not a data file this reader opens. It reads .json and .xml.`,
      },
    };
  }
  return format === 'json' ? readJsonTree(text, limits) : readXmlTree(text, limits);
}
