// Node / server entry point. Importing this module pulls in Ajv's runtime
// code-generation path, which is NOT CSP-safe under Chrome MV3.
// Browser code paths must import from `@md-business/core` (the main entry).
export { validateWith } from './validate-runtime.js';
export { parseAndValidate } from './pipeline.js';
