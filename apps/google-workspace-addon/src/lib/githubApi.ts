import type { TestSpec } from '@md-business/schema-test-spec';

export type RepoRef = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
};

const DEFAULT_BRANCH = 'main';

export function parseRepoRef(input: string): RepoRef | null {
  if (typeof input !== 'string') return null;
  const ref = input.trim();
  if (ref.length === 0) return null;

  const slashIndex = ref.indexOf('/');
  if (slashIndex <= 0) return null;
  const owner = ref.slice(0, slashIndex);
  const rest = ref.slice(slashIndex + 1);
  if (owner.length === 0 || rest.length === 0) return null;

  let repo: string;
  let branch: string;
  let pathPart: string;

  const atIndex = rest.indexOf('@');
  if (atIndex >= 0) {
    repo = rest.slice(0, atIndex);
    const branchPath = rest.slice(atIndex + 1);
    const colonIndex = branchPath.indexOf(':');
    if (colonIndex < 0) return null;
    branch = branchPath.slice(0, colonIndex);
    pathPart = branchPath.slice(colonIndex + 1);
  } else {
    const colonIndex = rest.indexOf(':');
    if (colonIndex < 0) return null;
    repo = rest.slice(0, colonIndex);
    branch = DEFAULT_BRANCH;
    pathPart = rest.slice(colonIndex + 1);
  }

  if (repo.length === 0 || branch.length === 0 || pathPart.length === 0) {
    return null;
  }

  return { owner, repo, branch, path: pathPart };
}

export function buildContentsUrl(ref: RepoRef): string {
  const encodedPath = ref.path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const encodedBranch = encodeURIComponent(ref.branch);
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encodedPath}?ref=${encodedBranch}`;
}

export type GitHubCommitter = {
  name: string;
  email: string;
};

export type ContentsPutPayloadInput = {
  message: string;
  contentBase64: string;
  branch: string;
  sha?: string;
  committer?: GitHubCommitter;
};

export type ContentsPutPayload = {
  message: string;
  content: string;
  branch: string;
  sha?: string;
  committer?: GitHubCommitter;
};

export function buildContentsPutPayload(
  input: ContentsPutPayloadInput,
): ContentsPutPayload {
  const payload: ContentsPutPayload = {
    message: input.message,
    content: input.contentBase64,
    branch: input.branch,
  };
  if (input.sha !== undefined) {
    payload.sha = input.sha;
  }
  if (input.committer !== undefined) {
    payload.committer = input.committer;
  }
  return payload;
}

export function extractRepoRefFromSpec(spec: TestSpec): RepoRef | null {
  if (typeof spec.repository !== 'string') return null;
  return parseRepoRef(spec.repository);
}

export type AutoCommitMessageInput = {
  spec: TestSpec;
  sheetName: string;
  isoTimestamp: string;
  customMessage?: string;
};

export function buildAutoCommitMessage(input: AutoCommitMessageInput): string {
  if (input.customMessage !== undefined && input.customMessage.length > 0) {
    return input.customMessage;
  }
  const safeSheetName = input.sheetName.replace(/"/g, '');
  return `chore(test-spec): sync ${input.spec.documentNumber} from "${safeSheetName}" — ${input.isoTimestamp}`;
}
