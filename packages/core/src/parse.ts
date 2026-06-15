import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root } from 'mdast';
import type { ParsedMarkdown } from './types.js';

const processor = unified().use(remarkParse);

export function parseMarkdown(src: string): ParsedMarkdown {
  const { data, content } = matter(src);
  const ast = processor.parse(content) as unknown as Root;
  return {
    data: data as Record<string, unknown>,
    body: content,
    ast,
  };
}
