import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root } from 'mdast';
import type { ParsedMarkdown } from './types.js';
import { splitFrontmatter } from './frontmatter.js';

const processor = unified().use(remarkParse);

export function parseMarkdown(src: string): ParsedMarkdown {
  const { data, body } = splitFrontmatter(src);
  const ast = processor.parse(body) as unknown as Root;
  return { data, body, ast };
}
