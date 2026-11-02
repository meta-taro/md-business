export { baseName, fileKind, type FileKind } from './kind.js';
export { normalizeForSearch, normalizeWithOffsets, splitQuery } from './normalize.js';
export { contentHash, thumbnailKey, type ThumbnailKeyInput } from './thumbnailKey.js';
export {
  indexWorkspace,
  searchIndex,
  searchWorkspace,
  titleOf,
  type IndexedFile,
  type MatchedIn,
  type SearchOptions,
  type WorkspaceFile,
  type WorkspaceHit,
} from './localSearch.js';
export {
  readSampleIndex,
  searchSamples,
  type ReadSampleIndexOptions,
  type Sample,
  type SampleIndexResult,
} from './sampleIndex.js';
