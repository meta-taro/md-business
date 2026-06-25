import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, '../appsscript.json');

interface Manifest {
  oauthScopes?: string[];
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
const scopes = new Set<string>(manifest.oauthScopes ?? []);

describe('apps/google-workspace-addon/appsscript.json oauthScopes', () => {
  it('includes script.external_request (used by pushTestSpecToGithub UrlFetchApp.fetch)', () => {
    expect(scopes.has('https://www.googleapis.com/auth/script.external_request')).toBe(true);
  });

  it('includes container UI + spreadsheets + currentonly editor scopes (sidebar baseline)', () => {
    expect(scopes.has('https://www.googleapis.com/auth/script.container.ui')).toBe(true);
    expect(scopes.has('https://www.googleapis.com/auth/spreadsheets')).toBe(true);
    expect(scopes.has('https://www.googleapis.com/auth/documents.currentonly')).toBe(true);
    expect(scopes.has('https://www.googleapis.com/auth/presentations.currentonly')).toBe(true);
  });

  it('does NOT include script.scriptapp (onEdit installable trigger was removed in #35 push-button refactor; Workspace Add-on context does not allow this scope)', () => {
    expect(scopes.has('https://www.googleapis.com/auth/script.scriptapp')).toBe(false);
  });
});
