import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, '../appsscript.json');

interface Manifest {
  oauthScopes?: string[];
  urlFetchWhitelist?: string[];
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
const scopes = new Set<string>(manifest.oauthScopes ?? []);
const whitelist = new Set<string>(manifest.urlFetchWhitelist ?? []);

describe('apps/google-workspace-addon/appsscript.json oauthScopes', () => {
  it('includes script.external_request (used by pushTestSpecToGithub UrlFetchApp.fetch)', () => {
    expect(scopes.has('https://www.googleapis.com/auth/script.external_request')).toBe(true);
  });

  it('includes container UI + all-currentonly editor scopes (sidebar baseline, minimal surface)', () => {
    expect(scopes.has('https://www.googleapis.com/auth/script.container.ui')).toBe(true);
    expect(scopes.has('https://www.googleapis.com/auth/spreadsheets.currentonly')).toBe(true);
    expect(scopes.has('https://www.googleapis.com/auth/documents.currentonly')).toBe(true);
    expect(scopes.has('https://www.googleapis.com/auth/presentations.currentonly')).toBe(true);
  });

  it('does NOT include broad spreadsheets scope (downgraded to .currentonly in #48 to reduce Marketplace sensitive scopes to 1)', () => {
    expect(scopes.has('https://www.googleapis.com/auth/spreadsheets')).toBe(false);
  });

  it('does NOT include script.scriptapp (onEdit installable trigger was removed in #35 push-button refactor; Workspace Add-on context does not allow this scope)', () => {
    expect(scopes.has('https://www.googleapis.com/auth/script.scriptapp')).toBe(false);
  });
});

describe('apps/google-workspace-addon/appsscript.json urlFetchWhitelist', () => {
  it('declares api.github.com (required by Marketplace deploy for Workspace add-ons that use UrlFetchApp)', () => {
    expect(whitelist.has('https://api.github.com/')).toBe(true);
  });
});
