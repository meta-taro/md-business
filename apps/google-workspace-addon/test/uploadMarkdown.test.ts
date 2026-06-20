import { describe, it, expect } from 'vitest';
import { validateUploadedMarkdown } from '../src/lib/uploadMarkdown.js';

describe('validateUploadedMarkdown', () => {
  it('accepts a plain .md file with frontmatter and body', () => {
    const content = '---\nschema: test-spec/v1\ntitle: ログイン\n---\n\n# 検証手順\n';
    const result = validateUploadedMarkdown(content, 'login.md');
    expect(result).toEqual({ ok: true, src: content });
  });

  it('accepts a .markdown extension as alias', () => {
    const content = '---\nschema: test-spec/v1\n---\n';
    const result = validateUploadedMarkdown(content, 'spec.markdown');
    expect(result.ok).toBe(true);
  });

  it('accepts uppercase .MD extension', () => {
    const content = '# heading\n';
    const result = validateUploadedMarkdown(content, 'README.MD');
    expect(result.ok).toBe(true);
  });

  it('rejects non-markdown extension', () => {
    const result = validateUploadedMarkdown('hello', 'note.txt');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/\.md/);
    }
  });

  it('rejects file with no extension', () => {
    const result = validateUploadedMarkdown('hello', 'README');
    expect(result.ok).toBe(false);
  });

  it('rejects empty content', () => {
    const result = validateUploadedMarkdown('', 'empty.md');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/空/);
    }
  });

  it('rejects whitespace-only content as empty', () => {
    const result = validateUploadedMarkdown('   \n\t\n', 'blank.md');
    expect(result.ok).toBe(false);
  });

  it('rejects content exceeding 5 MB (defensive)', () => {
    const huge = 'a'.repeat(5 * 1024 * 1024 + 1);
    const result = validateUploadedMarkdown(huge, 'huge.md');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/5\s*MB|大きすぎ/);
    }
  });

  it('normalizes CRLF line endings to LF', () => {
    const content = '---\r\nschema: test-spec/v1\r\n---\r\n\r\nbody\r\n';
    const result = validateUploadedMarkdown(content, 'win.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.src).not.toContain('\r');
      expect(result.src).toContain('schema: test-spec/v1');
    }
  });

  it('strips UTF-8 BOM if present', () => {
    const content = '﻿---\nschema: test-spec/v1\n---\n';
    const result = validateUploadedMarkdown(content, 'bom.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.src.startsWith('---')).toBe(true);
    }
  });

  it('accepts a body-only markdown (no frontmatter)', () => {
    const content = '# heading\n\nbody text';
    const result = validateUploadedMarkdown(content, 'body.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.src).toBe(content);
    }
  });

  it('rejects an empty file name', () => {
    const result = validateUploadedMarkdown('hello', '');
    expect(result.ok).toBe(false);
  });
});
