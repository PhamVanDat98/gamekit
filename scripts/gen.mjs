// gamekit gen image | voice | prompt | import — make assets from asset-manifest.json specs.
//   image   OpenAI image model; prompt = style (style/style.json) + brief; images with words get one
//           version per language with the exact string from Language/<code>.json (textKey)
//   voice   OpenAI speech for voice lines (voice: true + textKey), one file per language
//   prompt  print the prompts (for Codex, ChatGPT or any other tool)
//   import  bring a file made elsewhere in: fitted to the spec, labelled, recorded
import fs from 'node:fs';
import path from 'node:path';
import { exists, readJson, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, nowIso, ownershipOf } from './lib/game.mjs';
import { loadLanguages } from './lib/languages.mjs';
import { loadChosenStyle } from './lib/style.mjs';
import { decodePng, encodePng, fit } from './lib/png.mjs';
import { labelFiles } from './lib/provenance.mjs';
import { generateImage, generateSpeech, imageSizeFor } from './lib/openai.mjs';
import { check } from './lib/schema.mjs';

const IMAGE_MODEL = () => process.env.GAMEKIT_IMAGE_MODEL ?? 'gpt-image-1.5';
// gpt-image-2 only makes opaque images; sprites and UI with alpha need 1.5 (or gpt-image-1).
const NO_ALPHA_MODEL = /^gpt-image-2/;
const SPEECH_MODEL = () => process.env.GAMEKIT_SPEECH_MODEL ?? 'gpt-4o-mini-tts';
// File extension → API response_format. Only formats the web build ships (vite.config.ts audio kinds).
const SPEECH_FORMAT = { mp3: 'mp3', ogg: 'opus', aac: 'aac', wav: 'wav' };
const ASK_ABOVE = 5; // more API calls than this need --yes

const KIND_TEXT = {
  sprite: 'a single game sprite',
  ui: 'a game UI element',
  anim: 'an animation sprite sheet',
  background: 'a full game background',
  tile: 'a game tile',
  icon: 'a game icon',
  texture: 'a texture',
};

export function loadContext(root) {
  const game = loadGame(root);
  const manFile = path.join(root, 'asset-manifest.json');
  if (!exists(manFile)) throw new GkError('Chưa có asset-manifest.json (gamekit assets scan, skill asset-spec)');
  const man = readJson(manFile);
  const errs = check('asset-manifest', man);
  if (errs.length) throw new GkError(`asset-manifest.json không hợp lệ: ${errs.slice(0, 5).join('; ')}`);
  return { root, game, man, manFile, style: loadChosenStyle(root), langs: loadLanguages(root), codes: game.languages ?? ['en'] };
}

/** Output files of one asset: one per language when the asset has words in it. */
export function targets(ctx, a, only) {
  const localized = (a.text || a.voice) && a.path.startsWith('assets/i18n/en/');
  if (!localized) return [{ lang: null, path: a.path, words: null }];
  if (!a.textKey) throw new GkError(`${a.id}: ${a.text ? 'ảnh có chữ' : 'lời thoại'} cần textKey (key trong Language/*.json)`);
  const rest = a.path.slice('assets/i18n/en/'.length);
  return ctx.codes
    .filter((c) => !only || only.includes(c))
    .map((c) => {
      const words = ctx.langs[c]?.[a.textKey] ?? ctx.langs.en?.[a.textKey];
      if (typeof words !== 'string') throw new GkError(`${a.id}: không có key ${a.textKey} trong Language/en.json`);
      return { lang: c, path: c === 'en' ? a.path : `assets/i18n/${c}/${rest}`, words };
    });
}

const specSize = (a) => ({ w: a.frames ? a.frames.width * a.frames.count : a.width, h: a.height });

export function imagePrompt(ctx, a, t) {
  const s = ctx.style;
  const { w, h } = specSize(a);
  const parts = [];
  if (s?.art?.prompt) parts.push(`Art style: ${s.art.prompt}.`);
  if (s?.palette) parts.push(`Colour palette: ${['primary', 'secondary', 'surface', 'bg', 'text'].map((k) => s.palette[k]).filter(Boolean).join(', ')}.`);
  parts.push(`Make ${KIND_TEXT[a.kind] ?? 'a game asset'}: ${a.brief ?? a.id}.`);
  if (a.prompt) parts.push(a.prompt);
  parts.push(`Final size ${w}×${h} px — compose for that aspect ratio, keep important details large enough to read at that size.`);
  if (a.frames) parts.push(`Sprite sheet: exactly ${a.frames.count} frames side by side in one row, each ${a.frames.width}×${a.frames.height} px, same character and scale in every frame, evenly spaced.`);
  if (a.nineSlice) parts.push('UI panel that will be 9-slice scaled: plain stretchable middle, all decoration in the borders and corners.');
  if (a.seamless) parts.push('Seamless, tileable on every edge.');
  if (a.alpha) parts.push('Transparent background, one isolated subject, nothing touching the edges, no ground shadow.');
  if (t.words != null) {
    const name = ctx.langs[t.lang]?._meta?.name ?? t.lang;
    parts.push(`The image contains exactly this text, spelled exactly, in ${name}: "${t.words}". Clear, bold, legible lettering that fits inside the image with margin. No other text.`);
  } else parts.push('No text, letters, numbers, logos or watermarks.');
  if (s?.art?.negative) parts.push(`Avoid: ${s.art.negative}.`);
  return parts.join(' ');
}

/** Remakes must not ask for the original's names or brands (release.forbiddenTerms). */
function guard(ctx, a, text) {
  if (ownershipOf(ctx.game) !== 'third-party') return;
  const hit = (ctx.game.release?.forbiddenTerms ?? []).find((term) => term && text.toLowerCase().includes(String(term).toLowerCase()));
  if (hit) throw new GkError(`${a.id}: prompt có "${hit}" (release.forbiddenTerms) — mô tả thiết kế mới, không nhắc game gốc`);
}

/** Decode, fit to the spec (objects are contained, backgrounds/tiles fill), write PNG. */
export function writeFitted(root, rel, png, a) {
  if (!/\.png$/i.test(rel)) throw new GkError(`${rel}: gen chỉ ghi PNG — đổi path trong asset-manifest.json sang .png (nén WebP sau nếu cần)`);
  const { w, h } = specSize(a);
  const img = decodePng(png);
  const mode = a.alpha || ['sprite', 'ui', 'icon', 'anim'].includes(a.kind) ? 'contain' : 'cover';
  const out = path.join(root, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePng(fit(img, w, h, mode)));
}

function pick(ctx, args, wanted) {
  if (args.id) {
    const ids = String(args.id).split(',');
    const found = ids.map((id) => ctx.man.assets.find((a) => a.id === id) ?? id);
    const missing = found.filter((x) => typeof x === 'string');
    if (missing.length) throw new GkError(`Không có trong asset-manifest.json: ${missing.join(', ')}`);
    return { list: found, force: true };
  }
  return { list: ctx.man.assets.filter(wanted), force: Boolean(args.force) };
}

function record(ctx, a, model, prompt, langs) {
  a.gen = { model, at: nowIso(), prompt, ...(langs.length ? { langs } : {}) };
  writeJson(ctx.manFile, ctx.man);
}

async function image(ctx, args) {
  const only = args.lang ? String(args.lang).split(',') : null;
  const { list, force } = pick(ctx, args, (a) => a.make === 'image-gen' && a.kind !== 'audio');
  const jobs = [];
  for (const a of list) {
    if (a.kind === 'audio') throw new GkError(`${a.id}: là âm thanh — dùng gen voice (lời thoại) hoặc gen import`);
    if (!a.width || !a.height) throw new GkError(`${a.id}: thiếu width/height`);
    for (const t of targets(ctx, a, only)) if (force || !exists(path.join(ctx.root, t.path))) jobs.push({ a, t, prompt: imagePrompt(ctx, a, t) });
  }
  for (const j of jobs) guard(ctx, j.a, j.prompt);
  if (!jobs.length) {
    log.info('Không có ảnh nào cần sinh (asset có make: image-gen mà chưa có file). Chọn cụ thể: --id a,b');
    return 0;
  }
  if (args['dry-run'] || args.cmd === 'prompt') return printPrompts(ctx, jobs);
  if (jobs.length > ASK_ABOVE && !args.yes) throw new GkError(`Sẽ gọi API ${jobs.length} lần (tốn phí). Xem trước: --dry-run; chạy thật: thêm --yes`);
  const model = args.model ?? IMAGE_MODEL();
  const needAlpha = jobs.filter((j) => j.a.alpha).map((j) => j.a.id);
  if (NO_ALPHA_MODEL.test(model) && needAlpha.length)
    throw new GkError(`${model} không làm được nền trong suốt (${[...new Set(needAlpha)].join(', ')}) — dùng --model gpt-image-1.5`);
  const done = new Map();
  for (const [i, j] of jobs.entries()) {
    const { w, h } = specSize(j.a);
    log.info(`[${i + 1}/${jobs.length}] ${j.a.id}${j.t.lang ? ` (${j.t.lang})` : ''} → ${j.t.path}`);
    const png = await generateImage({ prompt: j.prompt, model, size: imageSizeFor(w, h), transparent: Boolean(j.a.alpha), quality: args.quality });
    writeFitted(ctx.root, j.t.path, png, j.a);
    labelFiles(ctx.root, [j.t.path], { label: 'generated', source: `${model} — gamekit gen image ${j.a.id}` });
    done.set(j.a, [...(done.get(j.a) ?? []), j]);
  }
  for (const [a, js] of done) record(ctx, a, model, js.find((j) => !j.t.lang || j.t.lang === 'en')?.prompt ?? js[0].prompt, js.map((j) => j.t.lang).filter(Boolean));
  log.ok(`Đã sinh ${jobs.length} ảnh, nhãn generated. Xem lại: gamekit review`);
  return 0;
}

async function voice(ctx, args) {
  const only = args.lang ? String(args.lang).split(',') : null;
  const { list, force } = pick(ctx, args, (a) => a.voice === true);
  const jobs = [];
  for (const a of list) {
    if (!a.voice) throw new GkError(`${a.id}: không phải lời thoại (cần voice: true, kind audio, textKey)`);
    const ext = path.extname(a.path).slice(1).toLowerCase();
    if (!SPEECH_FORMAT[ext]) throw new GkError(`${a.id}: đuôi .${ext} không hỗ trợ — dùng .mp3, .ogg, .aac hoặc .wav`);
    for (const t of targets(ctx, a, only)) if (force || !exists(path.join(ctx.root, t.path))) jobs.push({ a, t, format: SPEECH_FORMAT[ext] });
  }
  if (!jobs.length) {
    log.info('Không có lời thoại nào cần sinh. Chọn cụ thể: --id a,b');
    return 0;
  }
  if (args['dry-run']) {
    for (const j of jobs) log.info(`${j.a.id}${j.t.lang ? ` (${j.t.lang})` : ''} → ${j.t.path}: "${j.t.words}"`);
    return 0;
  }
  if (jobs.length > ASK_ABOVE && !args.yes) throw new GkError(`Sẽ gọi API ${jobs.length} lần (tốn phí). Xem trước: --dry-run; chạy thật: thêm --yes`);
  const model = args.model ?? SPEECH_MODEL();
  const voiceName = args.voice ?? ctx.style?.audio?.voice ?? 'alloy';
  for (const [i, j] of jobs.entries()) {
    log.info(`[${i + 1}/${jobs.length}] ${j.a.id} (${j.t.lang}) → ${j.t.path}`);
    const audio = await generateSpeech({ input: j.t.words, model, voice: voiceName, format: j.format, instructions: j.a.prompt ?? ctx.style?.audio?.prompt });
    const out = path.join(ctx.root, j.t.path);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, audio);
    labelFiles(ctx.root, [j.t.path], { label: 'generated', source: `${model} (${voiceName}) — gamekit gen voice ${j.a.id}` });
  }
  for (const a of new Set(jobs.map((j) => j.a))) record(ctx, a, model, `voice ${voiceName}`, jobs.filter((j) => j.a === a).map((j) => j.t.lang));
  log.ok(`Đã sinh ${jobs.length} file lời thoại, nhãn generated`);
  return 0;
}

function printPrompts(ctx, jobs) {
  const dir = path.join(ctx.root, '.gamekit', 'local', 'gen');
  fs.mkdirSync(dir, { recursive: true });
  for (const j of jobs) {
    const name = `${j.a.id}${j.t.lang ? `.${j.t.lang}` : ''}.txt`;
    const { w, h } = specSize(j.a);
    fs.writeFileSync(path.join(dir, name), `${j.prompt}\n`);
    log.info(`\n## ${j.a.id}${j.t.lang ? ` (${j.t.lang})` : ''} → ${j.t.path} (${w}×${h}${j.a.alpha ? ', nền trong suốt' : ''})\n${j.prompt}`);
  }
  log.info(`\nĐã lưu prompt vào .gamekit/local/gen/. Sinh ở đâu cũng được, rồi: gamekit gen import <id> <file> [--lang <mã>]`);
  return 0;
}

function importFile(ctx, args) {
  const [id, file] = args._.slice(1);
  if (!id || !file) throw new GkError('Dùng: gamekit gen import <id> <file> [--lang <mã>] [--label generated|licensed|own] [--source …] [--license …]');
  const a = ctx.man.assets.find((x) => x.id === id);
  if (!a) throw new GkError(`Không có ${id} trong asset-manifest.json`);
  const src = path.resolve(args.cwd ?? process.cwd(), file);
  if (!exists(src)) throw new GkError(`Không có ${file}`);
  const ts = targets(ctx, a, args.lang ? [args.lang] : ['en']);
  if (!ts.length) throw new GkError(`${args.lang} không có trong languages của game.yaml`);
  const t = ts[0];
  const label = args.label ?? 'generated';
  if (a.kind === 'audio') {
    if (path.extname(src).toLowerCase() !== path.extname(t.path).toLowerCase()) throw new GkError(`${file}: đuôi phải là ${path.extname(t.path)} như path trong asset-manifest.json`);
    fs.mkdirSync(path.dirname(path.join(ctx.root, t.path)), { recursive: true });
    fs.copyFileSync(src, path.join(ctx.root, t.path));
  } else {
    const buf = fs.readFileSync(src);
    if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new GkError(`${file}: cần file PNG (xuất PNG từ công cụ đã dùng)`);
    writeFitted(ctx.root, t.path, buf, a);
  }
  labelFiles(ctx.root, [t.path], { label, source: args.source ?? `import ${path.basename(src)}`, license: args.license ?? null });
  log.ok(`${a.id}${t.lang ? ` (${t.lang})` : ''} → ${t.path}${a.kind === 'audio' ? '' : ` (${specSize(a).w}×${specSize(a).h})`}, nhãn ${label}`);
  return 0;
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const [sub] = args._;
  const ctx = loadContext(root);
  if (sub === 'image') return image(ctx, args);
  if (sub === 'prompt') return image(ctx, { ...args, cmd: 'prompt', force: true });
  if (sub === 'voice') return voice(ctx, args);
  if (sub === 'import') return importFile(ctx, args);
  throw new GkError('Dùng: gamekit gen image|voice [--id a,b] [--lang vi] [--dry-run] [--yes] | gen prompt [--id a] | gen import <id> <file> [--lang vi]');
}

