import yaml from 'js-yaml';
import { findYamlLimitBreach } from './yamlGuard.js';

/**
 * The project configuration file, read from the project root.
 *
 * This file decides whether the JavaScript a project ships is allowed to run at
 * all, so it is read in exactly one place. A second reader — in another
 * language, against the same file — would eventually answer differently on some
 * input (quoting, folded scalars, how a boolean is spelled), and the side that
 * disagrees in favour of running scripts is the side that wins. One reader, one
 * answer.
 *
 * Reading it is not what stops execution, though. The declaration lives in the
 * repository, so whoever wrote the project controls every byte of it; it says
 * what the project *asks for*, never what it is permitted to do. Permission is
 * a separate record, kept per machine, that the project cannot write to. That
 * separation is what keeps a misreading here from turning into execution.
 */
export const PROJECT_CONFIG_FILENAME = 'md-business.yml';

/**
 * Size cap for the configuration file. It is a short header of a file — a few
 * lines naming a mode and, at most, a handful of origins.
 */
export const MAX_PROJECT_CONFIG_CHARS = 64_000;

/**
 * `document` is the mode every business document is written in: no scripts.
 * `web` is the one that runs them.
 */
export type ProjectMode = 'document' | 'web';

export interface ProjectConfig {
  mode: ProjectMode;
  /**
   * Extra places scripts may be loaded from, beyond the project's own files.
   * Always empty in document mode, and empty unless the project names them.
   */
  scriptOrigins: string[];
  /**
   * Where the project's own development server answers, when it runs one.
   *
   * The app points a window at this; it never starts the process. Only an
   * address on this machine is accepted — see `readDevServer`.
   */
  devServer: string | null;
}

export type ProjectConfigProblemKind =
  /** The YAML could not be parsed, or ran past a parser limit. */
  | 'unreadable'
  /** The file parsed, but is not a mapping of settings. */
  | 'not-a-mapping'
  /** `mode` was present but not one of the modes that exist. */
  | 'unknown-mode'
  /** `web.scriptOrigins` was present but is not a list. */
  | 'bad-script-origins'
  /** One entry of `web.scriptOrigins` was not usable and was dropped. */
  | 'origin-rejected'
  /** `web.devServer` was present but not an address this app will point at. */
  | 'bad-dev-server';

export interface ProjectConfigProblem {
  kind: ProjectConfigProblemKind;
  /** Ready to show, and says what to write instead where that is knowable. */
  message: string;
}

export interface ProjectConfigResult {
  /**
   * Always usable. Every failure below resolves to the mode that runs nothing,
   * so a caller that ignores `problems` entirely is still safe — it just cannot
   * tell the user why their declaration had no effect.
   */
  config: ProjectConfig;
  problems: ProjectConfigProblem[];
}

/** What a project gets when it has declared nothing, or declared it badly. */
function closedConfig(): ProjectConfig {
  return { mode: 'document', scriptOrigins: [], devServer: null };
}

/** Plain text is only trustworthy when it never leaves the machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocalHost(url: URL): boolean {
  return LOCAL_HOSTS.has(url.hostname);
}

/**
 * Turn one declared entry into an origin, or explain why it was dropped.
 *
 * Only an origin is accepted — scheme, host, port. A path is refused rather
 * than trimmed: `https://cdn.example.com/lib/v1.js` looks like it pins one
 * file, but the browser applies the origin regardless, so honouring it as
 * written would grant more than it appears to.
 */
function readOrigin(entry: unknown): { origin: string } | { message: string } {
  if (typeof entry !== 'string' || entry.trim() === '') {
    return {
      message: 'Each entry of web.scriptOrigins must be an origin such as https://example.com.',
    };
  }
  const raw = entry.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Covers `*`, `unsafe-inline`, `unsafe-eval` and every other CSP keyword in
    // one stroke: none of them is a URL. There is deliberately no spelling of
    // "allow everything" — a project able to write one would be declaring that
    // the setting does not apply to it.
    return {
      message: `web.scriptOrigins entry "${raw}" is not an origin. Write a full origin such as https://example.com.`,
    };
  }
  if (url.username !== '' || url.password !== '') {
    return {
      message: `web.scriptOrigins entry "${raw}" carries credentials. Write the origin alone.`,
    };
  }
  if (url.protocol === 'http:' && !isLocalHost(url)) {
    return {
      message:
        `web.scriptOrigins entry "${raw}" is served as plain text, so anyone between here and it ` +
        `can replace the script. Use https://${url.host} instead.`,
    };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      message: `web.scriptOrigins entry "${raw}" is not served over https. Write an https:// origin.`,
    };
  }
  const hasPath = url.pathname !== '' && url.pathname !== '/';
  if (hasPath || url.search !== '' || url.hash !== '') {
    return {
      message:
        `web.scriptOrigins entry "${raw}" names a file, but the browser applies the whole origin. ` +
        `Write ${url.origin} instead.`,
    };
  }
  return { origin: url.origin };
}

function readScriptOrigins(
  web: Record<string, unknown>,
  problems: ProjectConfigProblem[],
): string[] {
  const declared = web.scriptOrigins;
  if (declared === undefined || declared === null) return [];
  if (!Array.isArray(declared)) {
    problems.push({
      kind: 'bad-script-origins',
      message: 'web.scriptOrigins must be a list of origins.',
    });
    return [];
  }
  const origins: string[] = [];
  for (const entry of declared) {
    const read = readOrigin(entry);
    if ('message' in read) {
      problems.push({ kind: 'origin-rejected', message: read.message });
      continue;
    }
    // The same place written twice — with and without a trailing slash, say —
    // is one place.
    if (!origins.includes(read.origin)) origins.push(read.origin);
  }
  return origins;
}

/**
 * Turn a declared development-server address into one the app may display.
 *
 * Unlike `scriptOrigins`, a path is kept: a site is sometimes served under one,
 * and the address is used as written rather than as a permission that spreads
 * across an origin.
 *
 * Only this machine is accepted. The declaration ships with the project, so an
 * address elsewhere would let a file in the repository choose what the app
 * displays — and the window it lands in has no content restrictions, because
 * the project's own scripts have to run there. A development server that is
 * not on this machine is also not a development server.
 */
function readDevServer(entry: unknown): { url: string } | { message: string } {
  const written = typeof entry === 'string' ? entry.trim() : '';
  if (written === '') {
    return {
      message: 'web.devServer must be an address such as http://localhost:4321.',
    };
  }
  let url: URL;
  try {
    url = new URL(written);
  } catch {
    return {
      message: `web.devServer "${written}" is not an address. Write it in full, such as http://localhost:4321.`,
    };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      message: `web.devServer "${written}" is not served over http. Write http://localhost:4321, with the port your server prints.`,
    };
  }
  if (url.username !== '' || url.password !== '') {
    return {
      message: `web.devServer "${written}" carries credentials. Write the address alone.`,
    };
  }
  if (!isLocalHost(url)) {
    return {
      message: `web.devServer "${written}" is not on this machine. Write localhost, 127.0.0.1 or [::1] — the app shows a server you are running here, and never starts one.`,
    };
  }
  if (url.search !== '' || url.hash !== '') {
    return {
      message: `web.devServer "${written}" carries a query. Write the address the server prints, such as ${url.origin}${url.pathname}.`,
    };
  }
  return { url: url.href };
}

/**
 * Read the project configuration file.
 *
 * Never throws, and never leaves the caller without a configuration: anything
 * unclear resolves to the mode that runs no scripts, with a problem describing
 * what was unclear. Failing towards "runs nothing" is what makes it safe to
 * call this before knowing whether the file is trustworthy — and the file
 * never is, since it arrives with the project.
 *
 * @param source  the file's contents, or an empty string when it is absent
 */
export function parseProjectConfig(source: string): ProjectConfigResult {
  const problems: ProjectConfigProblem[] = [];

  const breach = findYamlLimitBreach(source, MAX_PROJECT_CONFIG_CHARS, PROJECT_CONFIG_FILENAME);
  if (breach) {
    return { config: closedConfig(), problems: [{ kind: 'unreadable', message: breach.message }] };
  }

  let parsed: unknown;
  try {
    // JSON_SCHEMA, as for frontmatter: no dates, no custom tags, nothing that
    // turns text into a constructed value.
    parsed = yaml.load(source, { schema: yaml.JSON_SCHEMA });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      config: closedConfig(),
      problems: [
        { kind: 'unreadable', message: `${PROJECT_CONFIG_FILENAME} could not be read: ${reason}` },
      ],
    };
  }

  // An empty file, or one holding only comments, declares nothing — which is
  // the ordinary state of a business-document project, not a mistake.
  if (parsed === null || parsed === undefined) {
    return { config: closedConfig(), problems };
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      config: closedConfig(),
      problems: [
        {
          kind: 'not-a-mapping',
          message: `${PROJECT_CONFIG_FILENAME} must be a mapping of settings, such as "mode: web".`,
        },
      ],
    };
  }

  const root = parsed as Record<string, unknown>;

  let mode: ProjectMode = 'document';
  const declaredMode = root.mode;
  if (declaredMode !== undefined && declaredMode !== null) {
    if (declaredMode === 'web' || declaredMode === 'document') {
      mode = declaredMode;
    } else {
      problems.push({
        kind: 'unknown-mode',
        message: 'mode must be written as "web" or "document".',
      });
    }
  }

  // Read only in the mode it applies to. Answering with origins a document
  // project happens to list would suggest they are in effect somewhere.
  let scriptOrigins: string[] = [];
  let devServer: string | null = null;
  if (mode === 'web') {
    const web = root.web;
    if (web !== undefined && web !== null) {
      if (typeof web === 'object' && !Array.isArray(web)) {
        const settings = web as Record<string, unknown>;
        scriptOrigins = readScriptOrigins(settings, problems);
        const declaredDev = settings.devServer;
        if (declaredDev !== undefined && declaredDev !== null) {
          const read = readDevServer(declaredDev);
          if ('message' in read) {
            problems.push({ kind: 'bad-dev-server', message: read.message });
          } else {
            devServer = read.url;
          }
        }
      } else {
        problems.push({
          kind: 'bad-script-origins',
          message: 'web must be a mapping, such as "web:" followed by "  scriptOrigins:".',
        });
      }
    }
  }

  return { config: { mode, scriptOrigins, devServer }, problems };
}

/**
 * The single line a tool may write on a project's behalf to declare web mode.
 *
 * It is the shortest text `parseProjectConfig` reads back as web mode, and it
 * carries no comment on purpose. The app that offers to write it has four
 * interface languages, and the file stays in the repository long after whoever
 * pressed the button — a sentence in one of those languages would be a guess
 * about who reads the project next.
 */
export const WEB_MODE_DECLARATION = 'mode: web\n';

/**
 * What a tool may do to `md-business.yml` without damaging what it finds.
 *
 * The file belongs to whoever wrote the project, so a tool may only create the
 * declaration where there is none, and may only remove the exact line it could
 * have written itself. Anything else — a comment, declared origins, a mode
 * spelled out by hand — is `locked`: still readable, still honoured, but not
 * for a tool to rewrite. Editing it would silently drop lines nobody asked to
 * lose, and the loss would not show until the project stopped behaving.
 *
 * Writing the declaration is not permission to run anything. It states what
 * the project asks for; consent is a separate per-machine record the project
 * cannot reach.
 */
export type WebModeToggle = 'declare' | 'withdraw' | 'locked';

/** @param source contents of `md-business.yml`, or an empty string if absent. */
export function webModeToggle(source: string): WebModeToggle {
  // Blank lines around the declaration say nothing in YAML, so a file that is
  // only whitespace is an absent declaration, not a locked one.
  const body = source.trim();
  if (body === '') return 'declare';
  if (body === WEB_MODE_DECLARATION.trim()) return 'withdraw';
  return 'locked';
}
