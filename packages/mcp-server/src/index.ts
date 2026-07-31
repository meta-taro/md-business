export { safeRelativePath } from './workspacePath.js';
export type { SafePathResult, SafePathOk, SafePathRejected } from './workspacePath.js';

export {
  SCHEMA_REGISTRY,
  listSchemas,
  resolveSchema,
  detectSchemaId,
} from './registry.js';
export type { SchemaEntry } from './registry.js';

export { MemoryDocumentStore } from './store.js';
export type { DocumentStore } from './store.js';
export { FileDocumentStore } from './fileStore.js';

export { diffLines } from './diff.js';
export type { DiffLine, DiffLineType } from './diff.js';

export { readDocument, validateDocument, createDocument, updateDocument } from './tools.js';
export type {
  ToolError,
  ReadDocumentOk,
  ValidateDocumentOk,
  CreateDocumentInput,
  CreateDocumentOk,
  UpdateDocumentInput,
  UpdateDocumentOk,
} from './tools.js';

export {
  searchDocuments,
  matchesQuery,
  extractTitle,
  extractDate,
  inDateRange,
  makeExcerpt,
} from './search.js';
export type { SearchQuery, SearchMatch, SearchDocumentsOk } from './search.js';

export { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';
export type { CreateServerOptions } from './server.js';

export { gitStatus, gitDiff, gitCommit, parseStatusPorcelainV2 } from './gitTools.js';
export type {
  GitRunner,
  GitRunResult,
  GitFileState,
  GitFileStatus,
  GitStatusSummary,
  GitStatusResult,
  GitDiffResult,
  GitCommitInput,
  GitCommitResult,
} from './gitTools.js';
export { createGitRunner, buildGitArgs } from './gitRunner.js';
export type { GitExec } from './gitRunner.js';

export { createAppBridge } from './appBridge.js';
export type {
  AppBridge,
  AppRequest,
  AppRequestResult,
  CreateAppBridgeOptions,
} from './appBridge.js';

export { startHttpServer } from './httpServer.js';
export type { StartHttpServerOptions, HttpServerHandle } from './httpServer.js';
export { parseBearerToken, isAuthorized } from './httpAuth.js';

export { buildToolLogEntry } from './toolLog.js';
export type { ToolLogEntry, ToolResultLike } from './toolLog.js';

export { splitControlLines, parseControlLine, encodeSidecarEvent } from './control.js';
export type {
  ControlCommand,
  SetRootCommand,
  ResponseCommand,
  ControlLineResult,
  SidecarEvent,
  ReadyEvent,
  RootEvent,
  ErrorEvent,
  RequestEvent,
} from './control.js';

export { startSidecar } from './sidecar.js';
export type { StartSidecarOptions, SidecarHandle, SidecarIo } from './sidecar.js';
