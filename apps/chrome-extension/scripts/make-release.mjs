// Pack apps/chrome-extension/dist into a Chrome Web Store-ready zip.
//
// The zip contains dist's contents with `manifest.json` at the archive root —
// NOT the dist/ folder itself — because the Store rejects nested layouts.
//
// Excluded by design:
//   - *.map           source maps (not needed in production, ~3 MB of waste)
//   - .DS_Store / Thumbs.db / desktop.ini   OS noise
//   - any *.zip / *.crx that happens to be inside dist (safety net)

import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeflateRaw } from 'node:zlib';
import { Buffer } from 'node:buffer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const DIST = join(PKG_ROOT, 'dist');
const OUT_DIR = join(PKG_ROOT, 'release');

const EXCLUDE_SUFFIX = ['.map'];
const EXCLUDE_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const EXCLUDE_EXT = new Set(['.zip', '.crx']);

function shouldExclude(absPath) {
  const name = absPath.split(/[\\/]/).pop() ?? '';
  if (EXCLUDE_NAMES.has(name)) return true;
  if (EXCLUDE_SUFFIX.some((s) => name.endsWith(s))) return true;
  const dot = name.lastIndexOf('.');
  if (dot >= 0 && EXCLUDE_EXT.has(name.slice(dot))) return true;
  return false;
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.isFile()) {
      if (!shouldExclude(full)) acc.push(full);
    }
  }
  return acc;
}

// Minimal ZIP writer (no external deps). Generates a STORED+DEFLATE archive
// with forward-slash paths, no extra fields, suitable for Chrome Web Store.
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function deflateRaw(buf) {
  return new Promise((resolveDef, rejectDef) => {
    const chunks = [];
    const def = createDeflateRaw({ level: 9 });
    def.on('data', (c) => chunks.push(c));
    def.on('end', () => resolveDef(Buffer.concat(chunks)));
    def.on('error', rejectDef);
    def.end(buf);
  });
}

async function writeZip(files, outPath) {
  const localParts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const compressed = await deflateRaw(data);
    const method = compressed.length < data.length ? 8 : 0;
    const payload = method === 8 ? compressed : data;

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    localParts.push(local, payload);

    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    nameBuf.copy(cd, 46);
    central.push(cd);

    offset += local.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  const out = createWriteStream(outPath);
  await new Promise((res, rej) => {
    out.on('error', rej);
    out.on('finish', res);
    for (const part of localParts) out.write(part);
    out.write(centralBuf);
    out.write(eocd);
    out.end();
  });
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('[release] dist/ not found. Run `pnpm build` first.');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
  const version = manifest.version;
  if (!version) {
    console.error('[release] manifest.json has no version field.');
    process.exit(1);
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `md-business-v${version}.zip`);

  const files = walk(DIST).map((abs) => ({
    name: relative(DIST, abs).replaceAll('\\', '/'),
    data: readFileSync(abs),
  }));

  await writeZip(files, outPath);

  const totalIn = files.reduce((n, f) => n + f.data.length, 0);
  const outSize = statSync(outPath).size;
  console.log(`[release] wrote ${outPath}`);
  console.log(`[release] ${files.length} files, ${(totalIn / 1024).toFixed(1)} KiB uncompressed → ${(outSize / 1024).toFixed(1)} KiB zipped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
