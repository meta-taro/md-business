import { describe, it, expect } from 'vitest';
import { renderInvoiceHtml } from '../src/renderHtml.js';
import { standardInvoice } from './fixtures.js';

describe('renderInvoiceHtml', () => {
  it('returns a full HTML document', () => {
    const html = renderInvoiceHtml(standardInvoice());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<title>請求書 INV-2026-0001</title>');
    expect(html).toContain('mdb-invoice');
  });

  it('respects a custom document title', () => {
    const html = renderInvoiceHtml(standardInvoice(), { documentTitle: 'Custom' });
    expect(html).toContain('<title>Custom</title>');
  });

  it('embeds inline styles when embedStyles is provided', () => {
    const css = '.x { color: red; }';
    const html = renderInvoiceHtml(standardInvoice(), { embedStyles: css });
    expect(html).toContain(`<style>${css}</style>`);
  });

  it('emits a <link> tag when stylesHref is provided', () => {
    const html = renderInvoiceHtml(standardInvoice(), { stylesHref: '/invoice.css' });
    expect(html).toContain('<link rel="stylesheet" href="/invoice.css">');
  });

  it('escapes the stylesHref attribute', () => {
    const html = renderInvoiceHtml(standardInvoice(), { stylesHref: '"><script>x' });
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('overrides the language attribute when lang is provided', () => {
    const html = renderInvoiceHtml(standardInvoice(), { lang: 'en' });
    expect(html).toContain('<html lang="en">');
  });
});
