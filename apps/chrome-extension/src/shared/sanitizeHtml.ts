import DOMPurify from 'dompurify';

/**
 * Sanitize the Markdown→HTML output before it is injected into the spec
 * preview pane. The viewer ships in a Chrome MV3 extension so the CSP already
 * blocks remote scripts, but the markdown body can still smuggle XSS via
 * inline `<svg>` event handlers or `javascript:` URLs. We harden the surface
 * with an explicit allowlist:
 *
 *   - inline `<svg>` (a v0.2.0 goal for diagrams pasted from draw.io / Excalidraw)
 *   - `<img>` with `data:image/{png,jpeg,gif,webp,svg+xml}`, `https:`, `blob:`
 *   - `<pre><code class="language-mermaid">` survives intact so the dynamic
 *     mermaid renderer can pick it up on a later pass
 *
 * Anything else (script tags, event handlers, `javascript:` URLs, foreign
 * objects, form elements) is dropped.
 *
 * DOMPurify needs a DOM. The chrome-extension viewer runs in a real browser,
 * so `window.document` is always present there. Vitest uses `jsdom` as its
 * environment, which also provides `window`. (We tried `happy-dom` first but
 * its HTML parser silently dropped leading `<h1>` elements when parsing body
 * fragments, breaking any spec whose first node is `# 概要`.) We pass
 * `globalThis.window` explicitly to a lazily-built DOMPurify instance so a
 * missing window throws a clear error instead of a confusing "factory is not
 * a function".
 */

type PurifyInstance = ReturnType<typeof DOMPurify>;

let purifyInstance: PurifyInstance | null = null;

// URI schemes allowed on URI-bearing attributes (href / src / action / ...).
//   1. https: / blob: / mailto: — safe outbound destinations
//   2. # / / ? — relative anchors, absolute paths, query-only URLs
//   3. data:image/{png|jpg|gif|webp|svg+xml};base64,... — embedded images only.
//      Generic `data:text/html` is intentionally excluded to prevent CSS-tricks
//      from smuggling renderable HTML through what looks like an image src.
const ALLOWED_URI_REGEXP =
  /^(?:https|blob|mailto):|^[#/?]|^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i;

// HTML / SVG attributes that carry URLs. The DOMPurify default `ALLOWED_URI_REGEXP`
// option is over-broad (it also strips non-URI attributes like SVG `viewBox`), so
// we apply the regex manually through `uponSanitizeAttribute` against this set.
const URI_ATTRIBUTES = new Set<string>([
  'href',
  'src',
  'xlink:href',
  'action',
  'formaction',
  'background',
  'poster',
  'cite',
  'longdesc',
  'data',
  'srcset',
]);

function getPurify(): PurifyInstance {
  if (purifyInstance) return purifyInstance;
  const win = (globalThis as { window?: Window }).window;
  if (!win) {
    throw new Error('sanitizeViewerHtml requires a window (browser or jsdom test env).');
  }
  const instance = DOMPurify(win as unknown as Window & typeof globalThis);
  // Enforce our own URI allowlist on URI-bearing attributes. We override the
  // hook decision in both directions so the policy is fully under our control:
  //   - match → keepAttr=true (overrides DOMPurify's default that would drop
  //     legitimate `blob:` / `data:image` references it doesn't ship)
  //   - no match → keepAttr=false (drops `http:` downgrades, `data:text/html`,
  //     and anything else outside the whitelist)
  // Non-URI attributes (e.g. SVG `viewBox`, `fill`, `class`) are untouched.
  instance.addHook('uponSanitizeAttribute', (_node, hookEvent) => {
    if (!URI_ATTRIBUTES.has(hookEvent.attrName)) return;
    const value = hookEvent.attrValue.trim();
    if (value === '') {
      hookEvent.keepAttr = false;
      return;
    }
    hookEvent.keepAttr = ALLOWED_URI_REGEXP.test(value);
  });
  purifyInstance = instance;
  return instance;
}

export interface SanitizeViewerHtmlOptions {
  /**
   * When true, accept inline `<svg>` elements. Defaults to true — the v0.2.0
   * spec viewer is the primary consumer and explicitly wants diagrams. Set to
   * false for narrower contexts (e.g. a future "trust = none" preview mode).
   */
  allowSvg?: boolean;
}

export function sanitizeViewerHtml(
  html: string,
  options: SanitizeViewerHtmlOptions = {},
): string {
  const { allowSvg = true } = options;
  const purify = getPurify();
  // USE_PROFILES with svg=true keeps SVG attributes in their original
  // (camelCase) form — viewBox, preserveAspectRatio, etc.
  const config: Parameters<typeof purify.sanitize>[1] = {
    USE_PROFILES: { html: true, svg: allowSvg, svgFilters: allowSvg, mathMl: false },
    FORBID_TAGS: [
      'form',
      'input',
      'button',
      'select',
      'option',
      'textarea',
      'iframe',
      'object',
      'embed',
    ],
    FORBID_ATTR: ['srcdoc'],
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
    // Disable DOMPurify's built-in protocol allowlist so our `uponSanitizeAttribute`
    // hook has final say. We need to do this because the built-in policy strips
    // legitimate schemes we want to allow (e.g. `blob:`). `javascript:` and
    // `vbscript:` remain blocked at a lower layer regardless.
    ALLOW_UNKNOWN_PROTOCOLS: true,
  };
  const out = purify.sanitize(html, config);
  return typeof out === 'string' ? out : String(out);
}

/**
 * Reset the cached DOMPurify instance. Tests use this between cases that
 * rebuild the jsdom window — production code never calls it.
 */
export function _resetSanitizerForTest(): void {
  purifyInstance = null;
}
