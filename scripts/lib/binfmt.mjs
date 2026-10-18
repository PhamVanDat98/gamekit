// Just enough of a few file formats to look inside a game build without external tools:
// zip (APK, IPA, nupkg), ECMA-335 metadata (.NET / Unity Mono assemblies), Godot .pck.
// Read-only and bounded; anything unexpected throws and the caller reports "không đọc được".
import fs from 'node:fs';
import zlib from 'node:zlib';

// ---------- zip ----------
/** Central directory of a zip file: [{ name, size, compSize, method, offset }]. */
export function zipEntries(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const total = fs.fstatSync(fd).size;
    const tailLen = Math.min(total, 65557);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, total - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
    if (eocd < 0) throw new Error('không phải file zip');
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOff = tail.readUInt32LE(eocd + 16);
    if (cdOff === 0xffffffff || count === 0xffff) throw new Error('zip64 chưa hỗ trợ');
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    const out = [];
    for (let p = 0; p + 46 <= cd.length && out.length < count; ) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const nameLen = cd.readUInt16LE(p + 28);
      const extra = cd.readUInt16LE(p + 30);
      const comment = cd.readUInt16LE(p + 32);
      out.push({
        name: cd.toString('utf8', p + 46, p + 46 + nameLen),
        method: cd.readUInt16LE(p + 10),
        compSize: cd.readUInt32LE(p + 20),
        size: cd.readUInt32LE(p + 24),
        offset: cd.readUInt32LE(p + 42),
      });
      p += 46 + nameLen + extra + comment;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/** Bytes of one zip entry; with `max`, only (about) the first `max` uncompressed bytes. */
export function zipRead(file, entry, max = Infinity) {
  const fd = fs.openSync(file, 'r');
  try {
    const lh = Buffer.alloc(30);
    fs.readSync(fd, lh, 0, 30, entry.offset);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`${entry.name}: local header hỏng`);
    const start = entry.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    // Deflate rarely beats 1:20 on game data, so 32× the wanted size of input is plenty for a prefix.
    const want = Math.min(entry.compSize, max === Infinity ? entry.compSize : Math.max(65536, max * 32));
    const data = Buffer.alloc(want);
    fs.readSync(fd, data, 0, want, start);
    if (entry.method === 0) return data.subarray(0, Math.min(want, max));
    if (entry.method !== 8) throw new Error(`${entry.name}: kiểu nén ${entry.method} chưa hỗ trợ`);
    const out = zlib.inflateRawSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    return max === Infinity ? out : out.subarray(0, max);
  } finally {
    fs.closeSync(fd);
  }
}

// ---------- ECMA-335 metadata ----------
const TYPE_FLAGS = { visibility: 0x7, interface: 0x20, abstract: 0x80, sealed: 0x100 };

/** File offset of the metadata root: through the PE CLI header, else the first "BSJB" signature. */
function metadataOffset(buf) {
  try {
    if (buf.readUInt16LE(0) === 0x5a4d) {
      const pe = buf.readUInt32LE(0x3c);
      if (buf.readUInt32LE(pe) === 0x4550) {
        const sections = buf.readUInt16LE(pe + 6);
        const optSize = buf.readUInt16LE(pe + 20);
        const opt = pe + 24;
        const dd = opt + (buf.readUInt16LE(opt) === 0x20b ? 112 : 96);
        const cliRva = buf.readUInt32LE(dd + 14 * 8);
        const secTable = opt + optSize;
        const toOff = (rva) => {
          for (let i = 0; i < sections; i++) {
            const s = secTable + i * 40;
            const va = buf.readUInt32LE(s + 12);
            const size = Math.max(buf.readUInt32LE(s + 8), buf.readUInt32LE(s + 16));
            if (rva >= va && rva < va + size) return rva - va + buf.readUInt32LE(s + 20);
          }
          return -1;
        };
        const cli = cliRva ? toOff(cliRva) : -1;
        if (cli >= 0) {
          const md = toOff(buf.readUInt32LE(cli + 8));
          if (md >= 0 && buf.readUInt32LE(md) === 0x424a5342) return md;
        }
      }
    }
  } catch {
    /* fall through to the signature scan */
  }
  return buf.indexOf(Buffer.from('BSJB', 'latin1'));
}

/**
 * Types defined in a .NET assembly: [{ ns, name, base, kind, methods, fields }].
 * `base` is the base type's full name; `kind` = class | struct | enum | interface | delegate.
 * Nested and compiler-generated types are left out. Returns null when the file has no metadata.
 */
export const dotnetTypes = (buf) => dotnetMetadata(buf)?.types ?? null;

/** { types, refs }: the types above plus every type the assembly references (full names, e.g. UnityEngine.Rigidbody). */
export function dotnetMetadata(buf) {
  const root = metadataOffset(buf);
  if (root < 0) return null;
  const verLen = buf.readUInt32LE(root + 12);
  let p = root + 16 + verLen + 2;
  const nStreams = buf.readUInt16LE(p);
  p += 2;
  const streams = {};
  for (let i = 0; i < nStreams; i++) {
    const off = buf.readUInt32LE(p);
    const size = buf.readUInt32LE(p + 4);
    let end = p + 8;
    while (buf[end] !== 0) end++;
    const name = buf.toString('latin1', p + 8, end);
    streams[name] = { off: root + off, size };
    p = p + 8 + (Math.floor((end - (p + 8)) / 4) + 1) * 4;
  }
  const tbl = streams['#~'] ?? streams['#-'];
  const strs = streams['#Strings'];
  if (!tbl || !strs) return null;
  const t = tbl.off;
  const heapSizes = buf[t + 6];
  const valid = buf.readBigUInt64LE(t + 8);
  const rows = new Array(64).fill(0);
  let q = t + 24;
  for (let i = 0; i < 64; i++) if ((valid >> BigInt(i)) & 1n) {
    rows[i] = buf.readUInt32LE(q);
    q += 4;
  }
  const strIdx = heapSizes & 1 ? 4 : 2;
  const guidIdx = heapSizes & 2 ? 4 : 2;
  const coded = (tables, bits) => (Math.max(...tables.map((i) => rows[i])) < 1 << (16 - bits) ? 2 : 4);
  const simple = (i) => (rows[i] < 65536 ? 2 : 4);
  const resolutionScope = coded([0x00, 0x1a, 0x23, 0x01], 2);
  const typeDefOrRef = coded([0x02, 0x01, 0x1b], 2);
  const moduleRow = 2 + strIdx + guidIdx * 3;
  const typeRefRow = resolutionScope + strIdx * 2;
  const typeDefRow = 4 + strIdx * 2 + typeDefOrRef + simple(0x04) + simple(0x06);
  const rd = (off, size) => (size === 2 ? buf.readUInt16LE(off) : buf.readUInt32LE(off));
  const str = (i) => {
    const s = strs.off + i;
    let e = s;
    while (buf[e] !== 0 && e < strs.off + strs.size) e++;
    return buf.toString('utf8', s, e);
  };
  const typeRefStart = q + rows[0x00] * moduleRow;
  const typeDefStart = typeRefStart + rows[0x01] * typeRefRow;

  const refs = [];
  for (let i = 0; i < rows[0x01]; i++) {
    const r = typeRefStart + i * typeRefRow + resolutionScope;
    const name = str(rd(r, strIdx));
    const ns = str(rd(r + strIdx, strIdx));
    refs.push(ns ? `${ns}.${name}` : name);
  }
  const defs = [];
  for (let i = 0; i < rows[0x02]; i++) {
    const r = typeDefStart + i * typeDefRow;
    const flags = buf.readUInt32LE(r);
    const name = str(rd(r + 4, strIdx));
    const ns = str(rd(r + 4 + strIdx, strIdx));
    const ext = rd(r + 4 + strIdx * 2, typeDefOrRef);
    const fieldList = rd(r + 4 + strIdx * 2 + typeDefOrRef, simple(0x04));
    const methodList = rd(r + 4 + strIdx * 2 + typeDefOrRef + simple(0x04), simple(0x06));
    defs.push({ flags, name, ns, ext, fieldList, methodList });
  }
  const full = (d) => (d.ns ? `${d.ns}.${d.name}` : d.name);
  const baseOf = (d) => {
    const idx = d.ext >> 2;
    if (!idx) return null;
    const tag = d.ext & 3;
    if (tag === 0) return defs[idx - 1] ? full(defs[idx - 1]) : null;
    if (tag === 1) return refs[idx - 1] ?? null;
    return '(generic)';
  };
  const out = [];
  defs.forEach((d, i) => {
    if (i === 0 && d.name === '<Module>') return;
    if ((d.flags & TYPE_FLAGS.visibility) > 1) return; // nested
    if (d.name.includes('<') || d.name.startsWith('__')) return; // compiler-generated
    const next = defs[i + 1];
    const base = baseOf(d);
    const kind = d.flags & TYPE_FLAGS.interface
      ? 'interface'
      : base === 'System.Enum'
        ? 'enum'
        : base === 'System.ValueType'
          ? 'struct'
          : base === 'System.MulticastDelegate'
            ? 'delegate'
            : 'class';
    out.push({
      ns: d.ns,
      name: d.name,
      base,
      kind,
      methods: Math.max(0, (next ? next.methodList : rows[0x06] + 1) - d.methodList),
      fields: Math.max(0, (next ? next.fieldList : rows[0x04] + 1) - d.fieldList),
    });
  });
  // Resolve each class's Unity role through base types defined in the same assembly.
  const byName = new Map(out.map((x) => [x.ns ? `${x.ns}.${x.name}` : x.name, x]));
  for (const x of out) {
    let b = x.base;
    for (let hop = 0; hop < 16 && b; hop++) {
      if (/^UnityEngine\.(MonoBehaviour|ScriptableObject|StateMachineBehaviour)$/.test(b)) {
        x.unity = b.slice(12);
        break;
      }
      b = byName.get(b)?.base;
    }
  }
  return { types: out, refs: [...new Set(refs)] };
}

// ---------- Godot .pck ----------
/** Godot pack: { godot: "4.2.1", files: [paths] }. Encrypted directories throw. */
export function godotPck(file, offset = 0) {
  const fd = fs.openSync(file, 'r');
  try {
    const h = Buffer.alloc(112);
    fs.readSync(fd, h, 0, 112, offset);
    if (h.toString('latin1', 0, 4) !== 'GDPC') throw new Error('không phải gói Godot (.pck)');
    const format = h.readUInt32LE(4);
    const godot = `${h.readUInt32LE(8)}.${h.readUInt32LE(12)}.${h.readUInt32LE(16)}`;
    let p = 20;
    if (format >= 2) {
      const flags = h.readUInt32LE(20);
      if (flags & 1) throw new Error(`gói Godot ${godot} bị mã hoá thư mục file`);
      p = 32;
    }
    p += 64; // reserved
    const count = h.readUInt32LE(p);
    let pos = offset + p + 4;
    const files = [];
    const lenBuf = Buffer.alloc(4);
    for (let i = 0; i < Math.min(count, 200000); i++) {
      fs.readSync(fd, lenBuf, 0, 4, pos);
      const len = lenBuf.readUInt32LE(0);
      if (len > 4096) throw new Error('thư mục .pck hỏng');
      const nameBuf = Buffer.alloc(len);
      fs.readSync(fd, nameBuf, 0, len, pos + 4);
      files.push(nameBuf.toString('utf8').replace(/\0+$/, ''));
      pos += 4 + len + 8 + 8 + 16 + (format >= 2 ? 4 : 0);
    }
    return { godot, files };
  } finally {
    fs.closeSync(fd);
  }
}
