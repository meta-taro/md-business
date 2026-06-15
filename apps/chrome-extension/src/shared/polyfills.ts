/**
 * Browser polyfills required by Node-targeted deps bundled into the extension.
 *
 * gray-matter (used transitively by @md-business/core) calls Buffer.isBuffer and
 * Buffer.from. The browser does not provide a global Buffer, so we mount a small
 * polyfill before any module touches it. Importing this file with a side effect
 * is enough — keep it as the FIRST import in each entry point.
 */
import { Buffer as BufferPolyfill } from 'buffer';

const target = globalThis as { Buffer?: unknown };
if (typeof target.Buffer === 'undefined') {
  target.Buffer = BufferPolyfill;
}
