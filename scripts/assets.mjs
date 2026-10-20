// gamekit assets — bring the original game's assets to the web.
//   scan [path]                  inventory: kind, size, dimensions, Unity sprite slicing, what to convert to
//   unity-atlas <png> [--meta]   Unity sprite sheet (.png + .meta) → atlas JSON (TexturePacker hash: Pixi, Phaser)
//   convert <file|dir…> --to D   images → WebP, audio → MP3/OGG/M4A with ffmpeg; --label adds provenance
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { exists, walk, writeJson, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { findGameRoot, requireGameRoot, loadGame, nowIso } from './lib/game.mjs';
import { openSource, kindOf, ASSET_KINDS } from './lib/source.mjs';
import { pngHeader, pngInfo } from './lib/png.mjs';
import { addProvenance } from './provenance.mjs';

// ---------- Unity sprite slicing (.meta) ----------

/** Unity SpriteAlignment → pivot (origin bottom-left, like Unity). 9 = custom: use the stored pivot. */
const ALIGN = [[0.5, 0.5], [0, 1], [0.5, 1], [1, 1], [0, 0.5], [1, 0.5], [0, 0], [0.5, 0], [1, 0]];

/** TextureImporter of a .meta: { mode: single|multiple|none, ppu, sprites: [{ name, rect, pivot, border }] } (Unity rects: y from the bottom). */
export function parseUnityMeta(text) {
  let doc;
  try {
    doc = YAML.parse(text.replace(/^%.*$/gm, '').replace(/!u!\d+/g, ''));
  } catch (e) {
    throw new GkError(`.meta không đọc được: ${e.message}`);
  }
  const ti = doc?.TextureImporter;
  if (!ti) return null;
  const mode = { 0: 'none', 1: 'single', 2: 'multiple', 3: 'polygon' }[ti.spriteMode] ?? 'none';
  const pivotOf = (alignment, pivot) => (alignment === 9 || alignment === undefined) && pivot ? [Number(pivot.x), Number(pivot.y)] : ALIGN[alignment ?? 0] ?? ALIGN[0];
  const sprites = (ti.spriteSheet?.sprites ?? []).map((s) => ({
    name: String(s.name),
    rect: { x: Number(s.rect.x), y: Number(s.rect.y), w: Number(s.rect.width), h: Number(s.rect.height) },
    pivot: pivotOf(s.alignment, s.pivot),
    border: s.border ? [Number(s.border.x), Number(s.border.y), Number(s.border.z), Number(s.border.w)] : [0, 0, 0, 0],
  }));
  return {
    mode,
    ppu: ti.spritePixelsToUnits ?? null,
    pivot: pivotOf(ti.alignment, ti.spritePivot),
    border: ti.spriteBorder ? [Number(ti.spriteBorder.x), Number(ti.spriteBorder.y), Number(ti.spriteBorder.z), Number(ti.spriteBorder.w)] : [0, 0, 0, 0],
    sprites,
  };
}

/**
 * Atlas JSON in TexturePacker "hash" format, which Pixi (Spritesheet) and Phaser (atlas) read directly.
 * Rects flip to top-left origin; anchor = Unity pivot with y flipped; 9-slice border → borders.
 */
export function unityAtlas(meta, { image, width, height }) {
  const list = meta.mode === 'multiple' ? meta.sprites : [{ name: path.parse(image).name, rect: { x: 0, y: 0, w: width, h: height }, pivot: meta.pivot, border: meta.border }];
  if (!list.length) throw new GkError('.meta không có sprite nào (spriteMode multiple nhưng spriteSheet.sprites rỗng)');
  const frames = {};
  for (const s of list) {
    if (frames[s.name]) throw new GkError(`sprite trùng tên "${s.name}"`);
    const y = height - (s.rect.y + s.rect.h);
    if (s.rect.x < 0 || y < 0 || s.rect.x + s.rect.w > width || y + s.rect.h > height) throw new GkError(`sprite "${s.name}" nằm ngoài ảnh ${width}×${height} — ảnh đã bị đổi cỡ so với lúc cắt trong Unity?`);
    const f = {
      frame: { x: s.rect.x, y, w: s.rect.w, h: s.rect.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: s.rect.w, h: s.rect.h },
      sourceSize: { w: s.rect.w, h: s.rect.h },
      anchor: { x: s.pivot[0], y: Math.round((1 - s.pivot[1]) * 1e6) / 1e6 },
    };
    const [l, b, r, t] = s.border;
    if (l || b || r || t) f.borders = { left: l, top: t, right: r, bottom: b };
    frames[s.name] = f;
  }
  return { frames, meta: { app: 'gamekit assets unity-atlas', image, size: { w: width, h: height }, scale: '1', ...(meta.ppu ? { pixelsPerUnit: meta.ppu } : {}) } };
}

// ---------- scan ----------

const SUGGEST = [
  [/\.(psd|tga|tiff?|bmp|exr|hdr|dds|ktx2?|pvr|astc)$/i, 'xuất PNG rồi convert → webp'],
  [/\.(png|jpe?g)$/i, 'webp (giữ PNG nếu cần pixel-perfect)'],
  [/\.(wav|aiff?|flac|wma)$/i, 'mp3 128k (nhạc nền 96–128k, hiệu ứng 64–96k)'],
  [/\.(ogg|m4a|aac|opus)$/i, 'mp3 (Safari cũ không phát ogg)'],
  [/\.(fbx|obj|dae|blend|3ds|max)$/i, 'glb (Blender export), nén Draco/Meshopt'],
  [/\.(ttf|otf)$/i, 'woff2 (chỉ glyph cần dùng)'],
  [/\.(fnt|fontsettings)$/i, 'bitmap font: giữ .fnt + atlas PNG→webp'],
  [/\.(skel|spine)$|\.atlas(\.txt)?$/i, 'giữ nguyên, dùng spine runtime web (pixi-spine / @esotericsoftware/spine-*)'],
  [/_ske\.json$|_tex\.json$/i, 'DragonBones: runtime web hoặc xuất sang Spine'],
  [/\.(anim|controller|overrideController|playable|mask)$/i, 'animation Unity: ghi keyframe/thời lượng vào notes/, dựng lại bằng code hoặc xuất spritesheet'],
  [/\.(mp4|mov|avi|m4v)$/i, 'mp4 H.264 hoặc webm, nén mạnh; cân nhắc bỏ'],
  [/\.(tmx|tsx|ldtk)$/i, 'giữ JSON (Tiled export JSON)'],
];

export function scanAssets(src) {
  const paths = new Set(src.entries.map((e) => e.path));
  const items = [];
  const totals = {};
  for (const e of src.entries) {
    const kind = kindOf(e.path);
    if (!ASSET_KINDS.includes(kind)) continue;
    const it = { path: e.path, kind, bytes: e.bytes };
    if (/\.png$/i.test(e.path)) {
      const h = pngHeader(src.read(e.path, 33));
      if (h) Object.assign(it, { width: h.width, height: h.height, ...(h.alpha !== null ? { alpha: h.alpha } : {}) });
    }
    if (paths.has(`${e.path}.meta`) && kind === 'image') {
      try {
        const m = parseUnityMeta(src.read(`${e.path}.meta`).toString('utf8'));
        if (m && m.mode !== 'none') it.unity = { spriteMode: m.mode, sprites: m.mode === 'multiple' ? m.sprites.length : 1, ...(m.ppu ? { ppu: m.ppu } : {}) };
      } catch {
        it.unity = { error: '.meta không đọc được' };
      }
    }
    const sug = SUGGEST.find(([re]) => re.test(e.path));
    if (sug) it.suggest = sug[1];
    if (it.unity?.spriteMode === 'multiple') it.suggest = `sprite sheet ${it.unity.sprites} sprite: gamekit assets unity-atlas, rồi ${it.suggest ?? 'webp'}`;
    items.push(it);
    totals[kind] ??= { files: 0, bytes: 0 };
    totals[kind].files++;
    totals[kind].bytes += e.bytes;
  }
  return { totals, items };
}

// ---------- convert (ffmpeg) ----------

const IMAGE_IN = /\.(png|jpe?g|bmp|tga|tiff?)$/i;
const AUDIO_IN = /\.(wav|ogg|mp3|m4a|aac|flac|aiff?|wma|opus)$/i;
const AUDIO_OUT = {
  mp3: ['-c:a', 'libmp3lame'],
  ogg: ['-c:a', 'libvorbis'],
  m4a: ['-c:a', 'aac'],
};

export function findFfmpeg(env = process.env) {
  const bin = env.GK_FFMPEG || 'ffmpeg';
  const r = spawnSync(bin, ['-hide_banner', '-version'], { encoding: 'utf8' });
  return r.status === 0 ? bin : null;
}

/** ffmpeg arguments for one file, or null when the file is not something convert handles. */
export function ffmpegArgs(input, output, { quality = 82, lossless = false, bitrate = '128k', audio = 'mp3' } = {}) {
  const head = ['-y', '-hide_banner', '-loglevel', 'error', '-i', input];
  if (IMAGE_IN.test(input)) return [...head, '-frames:v', '1', '-c:v', 'libwebp', ...(lossless ? ['-lossless', '1'] : ['-quality', String(quality)]), '-compression_level', '6', output];
  if (AUDIO_IN.test(input)) return [...head, '-vn', ...AUDIO_OUT[audio], '-b:a', String(bitrate), output];
  return null;
}

function convert(args) {
  const root = findGameRoot(args.cwd);
  const cwd = args.cwd ?? process.cwd();
  const inputs = args._.slice(1);
  if (!inputs.length) throw new GkError('Dùng: gamekit assets convert <file|thư mục…> [--to <thư mục>] [--quality 82] [--lossless] [--bitrate 128k] [--audio mp3|ogg|m4a] [--label own|…] [--force]');
  const audio = args.audio ?? 'mp3';
  if (!AUDIO_OUT[audio]) throw new GkError('--audio phải là mp3, ogg hoặc m4a');
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) throw new GkError('Không tìm thấy ffmpeg — cài ffmpeg (có libwebp, libmp3lame) hoặc đặt GK_FFMPEG=<đường dẫn>');
  const jobs = [];
  for (const inp of inputs) {
    const abs = path.resolve(cwd, inp);
    if (!exists(abs)) throw new GkError(`Không có ${inp}`);
    const isDir = fs.statSync(abs).isDirectory();
    const files = isDir ? walk(abs).map((r) => [path.join(abs, r), r]) : [[abs, path.basename(abs)]];
    for (const [file, rel] of files) {
      if (!IMAGE_IN.test(file) && !AUDIO_IN.test(file)) continue;
      const outDir = args.to ? path.resolve(cwd, String(args.to)) : isDir ? abs : path.dirname(abs);
      const ext = IMAGE_IN.test(file) ? '.webp' : `.${audio}`;
      const out = path.join(outDir, rel.replace(/\.[^.\/]+$/, ext));
      if (path.resolve(out) === path.resolve(file)) {
        log.dim(`bỏ qua ${rel}: đã là ${ext}`);
        continue;
      }
      jobs.push({ file, rel, out });
    }
  }
  if (!jobs.length) throw new GkError('Không có ảnh (png/jpg/bmp/tga/tif) hay âm thanh (wav/ogg/mp3/m4a/flac/aiff) nào để chuyển');
  let before = 0;
  let after = 0;
  const made = [];
  const failed = [];
  for (const j of jobs) {
    if (!args.force && exists(j.out) && fs.statSync(j.out).mtimeMs >= fs.statSync(j.file).mtimeMs) {
      log.dim(`đã có ${toPosix(path.relative(cwd, j.out))} (mới hơn bản gốc) — --force để làm lại`);
      made.push(j.out);
      continue;
    }
    fs.mkdirSync(path.dirname(j.out), { recursive: true });
    const r = spawnSync(ffmpeg, ffmpegArgs(j.file, j.out, { quality: args.quality ?? 82, lossless: !!args.lossless, bitrate: args.bitrate ?? '128k', audio }), { encoding: 'utf8' });
    if (r.status !== 0 || !exists(j.out)) {
      failed.push(`${j.rel}: ${(r.stderr || 'ffmpeg lỗi').trim().split('\n').pop()}`);
      continue;
    }
    const a = fs.statSync(j.file).size;
    const b = fs.statSync(j.out).size;
    before += a;
    after += b;
    made.push(j.out);
    (b > a ? log.warn : log.ok)(`${j.rel} → ${toPosix(path.relative(cwd, j.out))}  ${(a / 1024).toFixed(0)}KB → ${(b / 1024).toFixed(0)}KB${b > a ? ' (to hơn bản gốc — cân nhắc giữ bản gốc)' : ''}`);
  }
  if (before) log.info(`Tổng: ${(before / 1048576).toFixed(2)}MB → ${(after / 1048576).toFixed(2)}MB (${Math.round((1 - after / before) * 100)}% nhỏ hơn)`);
  if (args.label) {
    if (!root) throw new GkError('--label cần chạy trong thư mục game');
    const rels = made.map((f) => toPosix(path.relative(root, f))).filter((r) => !r.startsWith('..'));
    if (rels.length) {
      addProvenance(root, rels, { label: args.label, source: args.source ?? `gamekit assets convert từ bản gốc`, note: null });
      log.ok(`Đã gắn nhãn ${args.label} cho ${rels.length} file`);
    }
  } else if (made.length) log.info('Nhớ gắn nhãn: gamekit provenance add <file…> --label own (hoặc thêm --label ở lệnh này)');
  for (const f of failed) log.fail(f);
  return failed.length ? 1 : 0;
}

// ---------- commands ----------

const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`);

export async function run(args) {
  const [sub] = args._;
  const cwd = args.cwd ?? process.cwd();
  if (sub === 'scan') {
    const root = findGameRoot(cwd);
    const target = args._[1] ?? (root ? loadGame(root).source?.path : null);
    if (!target) throw new GkError('Dùng: gamekit assets scan <thư mục game gốc | .apk/.zip> [--write] [--json] (mặc định source.path trong game.yaml)');
    const src = openSource(path.resolve(root && !args._[1] ? root : cwd, target));
    let res;
    try {
      res = { source: src.label, at: nowIso(), ...scanAssets(src) };
    } finally {
      src.close();
    }
    if (args.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    else {
      log.head(`Asset trong ${res.source}`);
      for (const [k, v] of Object.entries(res.totals).sort((a, b) => b[1].bytes - a[1].bytes)) log.info(`  ${k.padEnd(8)} ${String(v.files).padStart(6)} file  ${kb(v.bytes).padStart(8)}`);
      const sheets = res.items.filter((i) => i.unity?.spriteMode === 'multiple');
      if (sheets.length) log.info(`Sprite sheet Unity: ${sheets.length} (${sheets.reduce((s, i) => s + i.unity.sprites, 0)} sprite) — gamekit assets unity-atlas`);
      log.info('Lớn nhất:');
      for (const i of [...res.items].sort((a, b) => b.bytes - a.bytes).slice(0, 8)) log.info(`  ${kb(i.bytes).padStart(8)}  ${i.path}${i.width ? ` (${i.width}×${i.height})` : ''}${i.suggest ? `  → ${i.suggest}` : ''}`);
    }
    if (args.write) {
      const gameRoot = requireGameRoot(cwd);
      writeJson(path.join(gameRoot, 'spec', 'asset-inventory.json'), res);
      if (!args.json) log.ok(`Đã ghi spec/asset-inventory.json (${res.items.length} asset)`);
    }
    return 0;
  }
  if (sub === 'unity-atlas') {
    const png = args._[1];
    if (!png) throw new GkError('Dùng: gamekit assets unity-atlas <ảnh.png> [--meta <ảnh.png.meta>] [--to <atlas.json>] [--image <tên ảnh trong atlas>]');
    const abs = path.resolve(cwd, png);
    const metaFile = path.resolve(cwd, args.meta ?? `${png}.meta`);
    if (!exists(abs)) throw new GkError(`Không có ${png}`);
    if (!exists(metaFile)) throw new GkError(`Không có ${path.relative(cwd, metaFile)} — Unity lưu cách cắt sprite trong file .meta cạnh ảnh`);
    const info = pngInfo(abs);
    if (!info) throw new GkError(`${png}: chưa phải PNG — xuất PNG đúng kích thước gốc trước (AssetRipper/Unity)`);
    const meta = parseUnityMeta(fs.readFileSync(metaFile, 'utf8'));
    if (!meta) throw new GkError(`${path.basename(metaFile)}: không có TextureImporter`);
    const image = args.image ?? path.basename(abs);
    const atlas = unityAtlas(meta, { image, width: info.width, height: info.height });
    const out = path.resolve(cwd, args.to ?? abs.replace(/\.png$/i, '.json'));
    writeJson(out, atlas);
    log.ok(`${toPosix(path.relative(cwd, out))}: ${Object.keys(atlas.frames).length} frame (${meta.mode}) từ ${path.basename(metaFile)}`);
    log.info('Nếu đổi ảnh sang webp: chạy convert rồi thêm --image <tên>.webp (kích thước giữ nguyên nên frame không đổi).');
    return 0;
  }
  if (sub === 'convert') return convert(args);
  throw new GkError('Dùng: gamekit assets scan | unity-atlas | convert — xem gamekit help');
}
