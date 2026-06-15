#!/usr/bin/env node
/**
 * Generates placeholder square icons (16/32/48/128) as solid-color PNGs with
 * a centered "M" glyph drawn pixel-by-pixel. Pure Node — zlib only, no deps.
 *
 * Replace these later with proper artwork before Chrome Web Store submission.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'icons');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const BG = [37, 99, 235, 255]; // tailwind blue-600
const FG = [255, 255, 255, 255];

/**
 * Build a tiny 8×8 bitmap of a stylised "M". 1 = foreground, 0 = background.
 */
const GLYPH = [
  '10000001',
  '11000011',
  '10100101',
  '10011001',
  '10000001',
  '10000001',
  '10000001',
  '10000001',
].map((row) => row.split('').map((c) => c === '1'));

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function buildPng(size) {
  const margin = Math.round(size * 0.18);
  const glyphSize = size - margin * 2;
  const cellSize = glyphSize / GLYPH.length;

  // RGBA scanlines prefixed with a filter byte (0 = None).
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter
    for (let x = 0; x < size; x++) {
      const px = y * stride + 1 + x * 4;
      let color = BG;

      const gx = Math.floor((x - margin) / cellSize);
      const gy = Math.floor((y - margin) / cellSize);
      if (gx >= 0 && gx < GLYPH.length && gy >= 0 && gy < GLYPH.length) {
        const row = GLYPH[gy];
        if (row && row[gx]) color = FG;
      }
      raw[px] = color[0];
      raw[px + 1] = color[1];
      raw[px + 2] = color[2];
      raw[px + 3] = color[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  const file = resolve(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, buildPng(size));
  console.log(`[make-icons] wrote ${file}`);
}
