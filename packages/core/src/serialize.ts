import yaml from 'js-yaml';

/**
 * Serialize frontmatter data + a Markdown body back into a single Markdown
 * source string. This is the inverse of {@link splitFrontmatter}:
 *
 *   splitFrontmatter(serializeMarkdown(data, body)) === { data, body }
 *
 * Used by write-path callers (the MCP `create_document` / `update_document`
 * tools, the desktop editor's "save frontmatter" flow) that hold structured
 * frontmatter plus a body and need a canonical `.md` on disk.
 *
 * Serialization policy, chosen so round-trips are byte-stable and git diffs
 * stay clean:
 *   - `JSON_SCHEMA` mirrors `splitFrontmatter`'s `yaml.load` schema so types
 *     survive the round-trip (no YAML 1.1 surprises like `no` → false).
 *   - `lineWidth: -1` disables line folding — long string scalars stay on one
 *     line instead of being wrapped mid-value.
 *   - `noRefs: true` inlines shared references instead of emitting `&anchor` /
 *     `*alias`, which downstream schema validators don't understand.
 *   - No `javascript`-type engine is involved (js-yaml, not gray-matter), so
 *     this stays CSP-safe for the MV3 / webview bundles.
 *
 * When `data` is empty the body is returned verbatim with no `---` fence, so an
 * unfronted document stays unfronted (again mirroring `splitFrontmatter`).
 */
export function serializeMarkdown(data: Record<string, unknown>, body: string): string {
  if (Object.keys(data).length === 0) {
    return body;
  }
  const yamlBlock = yaml.dump(data, {
    schema: yaml.JSON_SCHEMA,
    lineWidth: -1,
    noRefs: true,
  });
  // `yaml.dump` always terminates with a single trailing newline, so the
  // closing delimiter lands on its own line and the body follows immediately.
  return `---\n${yamlBlock}---\n${body}`;
}
