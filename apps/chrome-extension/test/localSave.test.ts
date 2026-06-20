import { describe, it, expect } from 'vitest';
import {
  buildSavePickerOptions,
  normalizeForSave,
  deriveSuggestedFileName,
  buildBackupRecord,
  BACKUP_STORAGE_KEY,
} from '../src/viewer/localSave.js';

describe('buildSavePickerOptions — File System Access API options', () => {
  it('sets a Markdown MIME type with .md and .markdown accepted', () => {
    const opts = buildSavePickerOptions('invoice.md');
    expect(opts.suggestedName).toBe('invoice.md');
    expect(opts.types).toHaveLength(1);
    const md = opts.types![0]!;
    expect(md.description).toMatch(/Markdown/);
    expect(md.accept['text/markdown']).toEqual(['.md', '.markdown']);
  });

  it('falls back to "untitled.md" when no name is given', () => {
    const opts = buildSavePickerOptions();
    expect(opts.suggestedName).toBe('untitled.md');
  });

  it('forces a .md extension when the caller passes a name without one', () => {
    const opts = buildSavePickerOptions('memo');
    expect(opts.suggestedName).toBe('memo.md');
  });

  it('keeps an existing .markdown extension intact', () => {
    const opts = buildSavePickerOptions('design.markdown');
    expect(opts.suggestedName).toBe('design.markdown');
  });
});

describe('normalizeForSave — pre-write text normalization', () => {
  it('converts CRLF to LF (and adds a trailing newline since one was missing)', () => {
    expect(normalizeForSave('a\r\nb\r\nc')).toBe('a\nb\nc\n');
  });

  it('converts CRLF to LF while preserving an existing trailing LF', () => {
    expect(normalizeForSave('a\r\nb\r\n')).toBe('a\nb\n');
  });

  it('ensures a single trailing newline', () => {
    expect(normalizeForSave('hello')).toBe('hello\n');
  });

  it('does not duplicate trailing newlines', () => {
    expect(normalizeForSave('hello\n\n')).toBe('hello\n\n');
  });

  it('returns "\\n" for empty input (still write a one-line file)', () => {
    expect(normalizeForSave('')).toBe('\n');
  });

  it('strips a UTF-8 BOM if present (the file system writer does not need it)', () => {
    expect(normalizeForSave('﻿hello\n')).toBe('hello\n');
  });
});

describe('deriveSuggestedFileName — pick the default for "save as"', () => {
  it('returns the existing filename when present', () => {
    expect(deriveSuggestedFileName({ existingName: 'spec.md' })).toBe('spec.md');
  });

  it('falls back to untitled.md when filename is missing', () => {
    expect(deriveSuggestedFileName({})).toBe('untitled.md');
  });

  it('falls back to untitled.md when filename is an empty string', () => {
    expect(deriveSuggestedFileName({ existingName: '' })).toBe('untitled.md');
  });

  it('replaces a non-markdown extension with .md', () => {
    expect(deriveSuggestedFileName({ existingName: 'note.txt' })).toBe('note.md');
  });
});

describe('buildBackupRecord — pre-overwrite snapshot for localStorage', () => {
  it('produces a stable storage key shared across the viewer', () => {
    const record = buildBackupRecord('content', 'invoice.md', 1_700_000_000_000);
    expect(record.key).toBe(BACKUP_STORAGE_KEY);
    expect(BACKUP_STORAGE_KEY).toBe('mdb:viewer:last-overwrite-backup');
  });

  it('serializes the snapshot as JSON with src / fileName / savedAt', () => {
    const record = buildBackupRecord('hello', 'spec.md', 1_700_000_000_000);
    const parsed = JSON.parse(record.payload) as {
      src: string;
      fileName: string;
      savedAt: string;
    };
    expect(parsed.src).toBe('hello');
    expect(parsed.fileName).toBe('spec.md');
    expect(parsed.savedAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('round-trips multi-line markdown content unmodified', () => {
    const src = '---\nschema: test-spec/v1\n---\n\n# 検証手順\n';
    const record = buildBackupRecord(src, 'login.md', 0);
    const parsed = JSON.parse(record.payload) as { src: string };
    expect(parsed.src).toBe(src);
  });
});
