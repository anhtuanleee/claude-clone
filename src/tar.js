// Minimal ustar reader/writer — just enough for small, flat bundles of
// regular files. Keeps the project dependency-free.
import zlib from 'node:zlib';

const BLOCK = 512;

function writeString(buf, str, offset, length) {
  buf.write(str, offset, Math.min(Buffer.byteLength(str), length), 'utf8');
}

function writeOctal(buf, num, offset, length) {
  // length-1 octal digits, zero padded, NUL terminated
  const s = num.toString(8).padStart(length - 1, '0');
  if (s.length > length - 1) throw new Error(`tar: value ${num} too large for field`);
  writeString(buf, s + '\0', offset, length);
}

function readString(buf, offset, length) {
  const slice = buf.subarray(offset, offset + length);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul === -1 ? length : nul).toString('utf8');
}

function readOctal(buf, offset, length) {
  const s = readString(buf, offset, length).trim();
  return s ? parseInt(s, 8) : 0;
}

function header(name, size, mode = 0o600) {
  if (Buffer.byteLength(name) > 100) throw new Error(`tar: name too long: ${name}`);
  const h = Buffer.alloc(BLOCK, 0);
  writeString(h, name, 0, 100);
  writeOctal(h, mode, 100, 8);
  writeOctal(h, 0, 108, 8); // uid
  writeOctal(h, 0, 116, 8); // gid
  writeOctal(h, size, 124, 12);
  writeOctal(h, 0, 136, 12); // mtime
  h.fill(0x20, 148, 156); // checksum placeholder: spaces
  h[156] = 0x30; // typeflag '0' = regular file
  writeString(h, 'ustar\0', 257, 6);
  writeString(h, '00', 263, 2);

  let sum = 0;
  for (const b of h) sum += b;
  writeString(h, sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

/**
 * Build a gzip-compressed tar from [{ name, data }] entries.
 * @returns {Buffer}
 */
export function packTarGz(entries) {
  const parts = [];
  for (const { name, data, mode } of entries) {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    parts.push(header(name, body.length, mode));
    parts.push(body);
    const pad = (BLOCK - (body.length % BLOCK)) % BLOCK;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(BLOCK * 2, 0)); // end-of-archive marker
  return zlib.gzipSync(Buffer.concat(parts));
}

function parsePax(data) {
  // records: "<len> <key>=<value>\n"
  const out = {};
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    if (sp === -1) break;
    const len = parseInt(data.subarray(i, sp).toString(), 10);
    if (!len) break;
    const rec = data.subarray(sp + 1, i + len - 1).toString('utf8');
    const eq = rec.indexOf('=');
    if (eq !== -1) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

/**
 * Read a gzip-compressed tar and return regular-file entries [{ name, data }].
 * Understands ustar prefixes, PAX `path`/`size` overrides and GNU long names,
 * so bundles produced by Go's archive/tar or BSD tar also work.
 */
export function unpackTarGz(gzBuf) {
  const buf = zlib.gunzipSync(gzBuf);
  const entries = [];
  let off = 0;
  let pax = null;
  let longName = null;

  while (off + BLOCK <= buf.length) {
    const h = buf.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) break;

    let name = readString(h, 0, 100);
    let size = readOctal(h, 124, 12);
    const type = String.fromCharCode(h[156] || 0x30);
    if (readString(h, 257, 6).startsWith('ustar')) {
      const prefix = readString(h, 345, 155);
      if (prefix) name = `${prefix}/${name}`;
    }
    if (pax?.size) size = parseInt(pax.size, 10);

    off += BLOCK;
    const data = buf.subarray(off, off + size);
    if (data.length < size) throw new Error('tar: unexpected end of archive');
    off += Math.ceil(size / BLOCK) * BLOCK;

    if (type === 'x') { pax = parsePax(data); continue; }
    if (type === 'g') continue;
    if (type === 'L') { longName = readString(data, 0, data.length); continue; }

    if (pax?.path) name = pax.path;
    if (longName) name = longName;
    pax = null;
    longName = null;

    if (type === '0' || type === '\0' || type === '7') {
      entries.push({ name, data: Buffer.from(data) });
    }
  }
  return entries;
}
