export { parseMarkdown } from './parse.js';
export { splitFrontmatter } from './frontmatter.js';
export { serializeMarkdown } from './serialize.js';
export { buildDocument } from './buildDocument.js';
export type { BuildDocumentInput, BuildDocumentResult } from './buildDocument.js';
export { renderMarkdownToHtml, type RenderMarkdownToHtmlOptions } from './markdownToHtml.js';
// `validateWithCompiled` is tree-shake-safe for browser bundles (no Ajv runtime).
// `validateWith` and `parseAndValidate` live in `./runtime` and pull in Ajv's
// code-generation runtime, which uses `new Function()` and is MV3-CSP-unsafe.
export { validateWithCompiled } from './validate.js';
export type { CompiledValidator } from './validate.js';
export type {
  ParsedMarkdown,
  ValidationError,
  ValidationResult,
  ParseAndValidateResult,
} from './types.js';
