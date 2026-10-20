// gamekit assets scan [--from reference|assets] [--write] — draft asset-manifest.json entries from the
// files that exist: sizes, alpha, a guessed kind, and a brief to finish by hand (skill asset-spec).
//   third-party: from reference/ (the original's assets) → specs for the new assets that replace them
//   own:         from assets/ (the original's assets, exported for the web) → specs that document them
import path from 'node:path';
import { exists, readJson, writeJson, walk } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, ownershipOf } from './lib/game.mjs';
import { imageSize } from './lib/png.mjs';
import { check } from './lib/schema.mjs';

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const AUDIO = /\.(ogg|mp3|wav|m4a|aac)$/i;

/** Guess a kind from the path; the agent corrects it in the brief pass. */
export function guessKind(rel) {
  const p = rel.toLowerCase();
  if (AUDIO.test(p)) return 'audio';
  if (/(^|[/_-])(icon|ico)s?([/_.-]|$)/.test(p)) return 'icon';
  if (/(^|[/_-])(ui|gui|hud|button|btn|panel|popup|dialog|menu|window|frame)s?([/_.-]|$)/.test(p)) return 'ui';
  if (/(^|[/_-])(bg|background|backdrop|sky|parallax)s?([/_.-]|$)/.test(p)) return 'background';
  if (/(^|[/_-])(tile|tileset|tilemap)s?([/_.-]|$)/.test(p)) return 'tile';
  if (/(^|[/_-])(anim|sheet|spritesheet|frames?)s?([/_.-]|$)|[_-]\d{2,}\.\w+$/.test(p)) return 'anim';
  return 'sprite';
}

/** Words in file names that often mean letters drawn into the image: worth a look before text: true. */
const TEXT_WORDS = new Set('logo title banner label caption tutorial tuto hint text txt word btn button play start ok cancel continue retry win lose gameover victory defeat level score shop menu new sale'.split(' '));
export const maybeText = (rel) =>
  path
    .basename(rel)
    .replace(/\.[^.]+$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((w) => TEXT_WORDS.has(w));

const slug = (rel) =>
  rel
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'asset';

export function scan(root, from) {
  const dir = path.join(root, from);
  const files = walk(dir).filter((f) => (IMAGE.test(f) || AUDIO.test(f)) && !f.startsWith('i18n/') && path.basename(f) !== '.gitkeep');
  return files.map((rel) => {
    const kind = guessKind(rel);
    const src = `${from}/${rel}`;
    const e = { id: slug(rel), kind };
    if (from === 'reference') {
      // The new asset is a web image/sound in assets/<kind folder>/ (asset-spec decides the final path).
      e.path = kind === 'audio' ? `assets/audio/${rel.replace(/\.[^.]+$/, '.ogg')}` : `assets/img/${rel.replace(/\.[^.]+$/, '.png')}`;
      e.ref = src;
    } else e.path = src;
    if (kind !== 'audio') {
      const size = imageSize(path.join(dir, rel));
      if (size) {
        e.width = size.width;
        e.height = size.height;
        if (size.alpha !== null) e.alpha = size.alpha;
      }
    }
    // Remakes need a brief for every new asset; own assets are the originals, only a possible text image needs a look.
    if (maybeText(rel)) e.brief = 'TODO: tên file gợi ý có chữ trong ảnh — có thì text: true, textKey, path trong assets/i18n/en/ (mỗi ngôn ngữ một bản)';
    else if (from === 'reference') e.brief = 'TODO: mô tả';
    return e;
  });
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const [sub] = args._;
  if (sub !== 'scan') throw new GkError('Dùng: gamekit assets scan [--from reference|assets] [--write]');
  const game = loadGame(root);
  const from = args.from ?? (ownershipOf(game) === 'third-party' ? 'reference' : 'assets');
  if (!['reference', 'assets'].includes(from)) throw new GkError('--from phải là reference hoặc assets');
  if (!exists(path.join(root, from))) throw new GkError(`Không có thư mục ${from}/`);
  const file = path.join(root, 'asset-manifest.json');
  const man = exists(file) ? readJson(file) : { $schema: './.gamekit/schemas/asset-manifest.schema.json', assets: [] };
  const known = new Set(man.assets.flatMap((a) => [a.path, a.ref].filter(Boolean)));
  const ids = new Set(man.assets.map((a) => a.id));
  // hero.png + hero.jpg in reference/ both become assets/img/hero.png; Hero.png and hero.png are one file on Windows/macOS.
  const paths = new Set(man.assets.map((a) => a.path.toLowerCase()));
  const fresh = scan(root, from).filter((e) => !known.has(e.ref ?? e.path));
  for (const e of fresh) {
    let id = e.id;
    for (let n = 2; ids.has(id); n++) id = `${e.id}-${n}`;
    e.id = id;
    ids.add(id);
    let p = e.path;
    for (let n = 2; paths.has(p.toLowerCase()); n++) p = e.path.replace(/(\.[^./]+)?$/, `-${n}$1`);
    e.path = p;
    paths.add(p.toLowerCase());
  }
  const byKind = {};
  for (const e of fresh) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  log.info(`${from}/: ${fresh.length} asset chưa có trong asset-manifest.json${fresh.length ? ` (${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`);
  const texty = fresh.filter((e) => e.brief?.includes('có chữ'));
  if (texty.length) log.warn(`${texty.length} file có tên gợi ý chữ trong ảnh — mở xem: ${texty.slice(0, 10).map((e) => e.ref ?? e.path).join(', ')}${texty.length > 10 ? '…' : ''}`);
  if (!args.write) {
    for (const e of fresh.slice(0, 30)) log.info(`  ${e.kind.padEnd(10)} ${e.width ? `${e.width}×${e.height}`.padEnd(10) : ''.padEnd(10)} ${e.ref ?? e.path}`);
    if (fresh.length > 30) log.info(`  … và ${fresh.length - 30} file khác`);
    log.info('Thêm --write để ghi vào asset-manifest.json, rồi viết brief từng mục (skill asset-spec).');
    return 0;
  }
  man.assets.push(...fresh);
  const errs = check('asset-manifest', man);
  if (errs.length) throw new GkError(`asset-manifest.json sẽ không hợp lệ: ${errs.slice(0, 5).join('; ')}`);
  writeJson(file, man);
  log.ok(`Đã thêm ${fresh.length} mục vào asset-manifest.json — còn ${man.assets.filter((a) => /^TODO/.test(a.brief ?? '')).length} brief TODO`);
  return 0;
}

