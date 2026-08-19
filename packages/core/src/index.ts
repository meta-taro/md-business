export { parseMarkdown } from './parse.js';
export {
  splitFrontmatter,
  MAX_FRONTMATTER_CHARS,
  MAX_YAML_ANCHORS,
  MAX_YAML_ALIASES,
} from './frontmatter.js';
export {
  FrontmatterError,
  classifyYamlReason,
  describeFrontmatterError,
} from './frontmatterError.js';
export type { FrontmatterProblem, FrontmatterProblemKind } from './frontmatterError.js';
export {
  findDepthOverflow,
  findStructureOverflow,
  depthValidationError,
  MAX_FRONTMATTER_DEPTH,
  MAX_FRONTMATTER_NODES,
} from './depth.js';
export type { StructureOverflow, StructureLimits } from './depth.js';
export { unusableSegmentReason } from './pathSegment.js';
export type { UnusableSegmentReason } from './pathSegment.js';
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
