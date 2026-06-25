import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const plaintextPath = resolve(here, '../../../docs/google-addon-marketplace-listing-plaintext.md');

const BEGIN_MARKER = '<!-- BEGIN PLAINTEXT -->';
const END_MARKER = '<!-- END PLAINTEXT -->';

function extractPlaintextBlock(): string {
  const raw = readFileSync(plaintextPath, 'utf8');
  const beginIdx = raw.indexOf(BEGIN_MARKER);
  const endIdx = raw.indexOf(END_MARKER);
  if (beginIdx < 0 || endIdx < 0 || endIdx <= beginIdx) {
    throw new Error(
      `plaintext markers not found or out of order in ${plaintextPath}: begin=${beginIdx}, end=${endIdx}`,
    );
  }
  return raw.slice(beginIdx + BEGIN_MARKER.length, endIdx).trim();
}

describe('docs/google-addon-marketplace-listing-plaintext.md', () => {
  it('exists at the expected path (Console 貼付用の独立ファイル)', () => {
    expect(existsSync(plaintextPath)).toBe(true);
  });

  it('contains the BEGIN/END plaintext markers in order', () => {
    const raw = readFileSync(plaintextPath, 'utf8');
    const beginIdx = raw.indexOf(BEGIN_MARKER);
    const endIdx = raw.indexOf(END_MARKER);
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(beginIdx);
  });

  it('plaintext block stays within Marketplace 4000-char limit for the detailed description', () => {
    const block = extractPlaintextBlock();
    expect(block.length).toBeGreaterThan(500);
    expect(block.length).toBeLessThanOrEqual(4000);
  });

  it('plaintext block contains the brand + 主要キーワード', () => {
    const block = extractPlaintextBlock();
    expect(block).toContain('md-business');
    expect(block).toContain('Markdown');
    expect(block).toContain('GitHub');
    expect(block).toContain('Sheets');
  });

  it('plaintext block does NOT include Markdown heading syntax (`## `) — must use 【】 instead', () => {
    const block = extractPlaintextBlock();
    const lines = block.split(/\r?\n/);
    const offending = lines.filter((line) => /^#{1,6}\s/.test(line));
    expect(offending).toEqual([]);
  });

  it('plaintext block does NOT include Markdown strong syntax (`**...**`)', () => {
    const block = extractPlaintextBlock();
    expect(block.includes('**')).toBe(false);
  });

  it('plaintext block does NOT include Markdown code fence (```) or inline backtick code spans', () => {
    const block = extractPlaintextBlock();
    expect(block.includes('```')).toBe(false);
    expect(block.includes('`')).toBe(false);
  });

  it('plaintext block does NOT include Markdown link syntax `[text](url)` — URLs must be bare', () => {
    const block = extractPlaintextBlock();
    expect(/\[[^\]]+\]\([^)]+\)/.test(block)).toBe(false);
  });

  it('plaintext block does NOT include list-item dash syntax (`- ` line start) — must use ・ instead', () => {
    const block = extractPlaintextBlock();
    const lines = block.split(/\r?\n/);
    const offending = lines.filter((line) => /^- /.test(line));
    expect(offending).toEqual([]);
  });
});
