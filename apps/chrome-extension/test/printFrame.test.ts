import { describe, it, expect, beforeEach } from 'vitest';
import { createPrintFrame, PRINT_FRAME_ID } from '../src/viewer/printFrame.js';

describe('createPrintFrame — DOM-side setup for the PDF print flow', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('appends a hidden iframe with the expected id and aria-hidden attribute', () => {
    const frame = createPrintFrame(document);
    expect(frame.id).toBe(PRINT_FRAME_ID);
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.tagName).toBe('IFRAME');
    expect(document.getElementById(PRINT_FRAME_ID)).toBe(frame);
    expect(frame.parentElement).toBe(document.body);
  });

  it('parks the frame off-screen rather than display:none (Chromium prints blank for the latter)', () => {
    const frame = createPrintFrame(document);
    expect(frame.style.position).toBe('fixed');
    expect(frame.style.left).toBe('-10000px');
    expect(frame.style.width).toBe('1px');
    expect(frame.style.height).toBe('1px');
    expect(frame.style.opacity).toBe('0');
    expect(frame.style.pointerEvents).toBe('none');
    expect(frame.style.display).not.toBe('none');
  });

  it('removes any leftover print frame from a previous attempt before appending a new one', () => {
    const first = createPrintFrame(document);
    const second = createPrintFrame(document);
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);
    expect(second.isConnected).toBe(true);
    // Exactly one #mdb-print-frame exists in the document.
    expect(document.querySelectorAll(`#${PRINT_FRAME_ID}`).length).toBe(1);
  });

  it('leaves any pre-existing non-print-frame siblings untouched (preview iframe must survive cancel)', () => {
    // Simulate the on-screen preview iframe that runPrintFlow must never touch.
    const preview = document.createElement('iframe');
    preview.id = 'mdb-preview';
    document.body.appendChild(preview);

    createPrintFrame(document);

    expect(document.getElementById('mdb-preview')).toBe(preview);
    expect(preview.isConnected).toBe(true);
  });
});
