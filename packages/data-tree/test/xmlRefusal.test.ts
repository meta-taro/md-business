import { describe, it, expect } from 'vitest';
import { readXmlTree } from '../src/index.js';

/** Every way this reader gives up has to say what it gave up on. */
function refusal(text: string) {
  const result = readXmlTree(text);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  expect(result.problem.message).not.toBe('');
  return result.problem;
}

describe('readXmlTree refusals', () => {
  it('refuses an attribute with no value', () => {
    expect(refusal('<a b></a>').kind).toBe('syntax');
  });

  it('refuses an unquoted attribute value', () => {
    expect(refusal('<a b=1></a>').kind).toBe('syntax');
  });

  it('refuses an attribute value that is never closed', () => {
    expect(refusal('<a b="1></a>').kind).toBe('syntax');
  });

  it('refuses a tag that never ends', () => {
    expect(refusal('<a b="1"').kind).toBe('syntax');
  });

  it('refuses a comment that is never closed', () => {
    expect(refusal('<a><!-- x</a>').kind).toBe('syntax');
  });

  it('refuses a CDATA section that is never closed', () => {
    expect(refusal('<a><![CDATA[x</a>').kind).toBe('syntax');
  });

  it('refuses a processing instruction that is never closed', () => {
    expect(refusal('<?xml version="1.0"<a/>').kind).toBe('syntax');
  });

  it('refuses a closing tag that is never finished', () => {
    expect(refusal('<a></a').kind).toBe('syntax');
  });

  it('refuses a closing tag for an element that was never opened', () => {
    expect(refusal('<a/></b>').kind).toBe('syntax');
  });

  it('refuses a bare "<" in text', () => {
    expect(refusal('<a>< b</a>').kind).toBe('syntax');
  });

  it('refuses text outside the root element', () => {
    expect(refusal('<a/>tail').kind).toBe('syntax');
  });

  it('refuses markup other than a document type declaration', () => {
    expect(refusal('<![WHAT[x]]><a/>').kind).toBe('syntax');
  });

  it('refuses a bare "&" in text', () => {
    expect(refusal('<a>x & y</a>').kind).toBe('entity');
  });

  it('refuses a bare "&" in an attribute value', () => {
    expect(refusal('<a b="x & y"/>').kind).toBe('entity');
  });

  it('refuses a numeric reference that is not a character', () => {
    expect(refusal('<a>&#x110000;</a>').kind).toBe('syntax');
  });

  it('names the line it stopped on', () => {
    expect(refusal('<a>\n\n<b>&nope;</b>\n</a>').line).toBe(3);
  });
});
