// gamekit store [--portal p] — store page material: images for each portal cut from store/source/
// (icon.png, landscape.png, portrait.png; screenshots from the last smoke test when missing) and a
// check of store/listing.yaml against each portal's limits.
import fs from 'node:fs';
import path from 'node:path';
import { exists, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame } from './lib/game.mjs';
import { decodePng, encodePng, fit } from './lib/png.mjs';
import { listingSkeleton, storePortals, storeProblems, storeSpec } from './lib/store.mjs';

/** Newest smoke screenshot of a scenario, as a fallback source. */
function smokeShot(root, name) {
  const dir = path.join(root, '.gamekit', 'local', 'smoke');
  if (!exists(dir)) return null;
  const runs = fs.readdirSync(dir).sort().reverse();
  for (const r of runs) {
    const f = path.join(dir, r, name);
    if (exists(f)) return f;
  }
  return null;
}

export function sources(root) {
  const src = (n) => {
    const f = path.join(root, 'store', 'source', `${n}.png`);
    return exists(f) ? f : null;
  };
  return {
    icon: src('icon'),
    landscape: src('landscape') ?? smokeShot(root, 'desktop-play.png'),
    portrait: src('portrait') ?? smokeShot(root, 'phone-portrait-play.png'),
  };
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const portals = args.portal ? [args.portal] : storePortals(game);
  if (!portals.length) throw new GkError('Không có portal nào cần trang store (dev-mock chỉ để chạy thử)');
  const listing = path.join(root, 'store', 'listing.yaml');
  if (!exists(listing)) {
    fs.mkdirSync(path.dirname(listing), { recursive: true });
    fs.writeFileSync(listing, listingSkeleton(game));
    log.ok('Đã tạo store/listing.yaml — điền mô tả, cách chơi, tag (mỗi ngôn ngữ một bản)');
  }
  const src = sources(root);
  const decoded = {};
  for (const id of portals) {
    const { spec } = storeSpec(id);
    for (const img of spec.images ?? []) {
      const from = src[img.from];
      if (!from) {
        log.warn(`${id}/${img.name}: chưa có ảnh nguồn store/source/${img.from}.png${img.from === 'icon' ? '' : ' (hoặc chạy gamekit smoke để có ảnh chụp)'}`);
        continue;
      }
      decoded[from] ??= decodePng(fs.readFileSync(from));
      const out = path.join(root, 'store', id, `${img.name}.png`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, encodePng(fit(decoded[from], img.width, img.height, img.fit ?? 'cover')));
      log.ok(`store/${id}/${img.name}.png ${img.width}×${img.height} ← ${toPosix(path.relative(root, from))}`);
    }
  }
  const { errors, warnings } = storeProblems(root, game, args.portal);
  for (const w of warnings) log.warn(w);
  for (const e of errors) log.fail(e);
  if (errors.length) {
    log.fail(`store: ${errors.length} lỗi`);
    return 1;
  }
  log.ok('store: đủ ảnh và mô tả cho mọi portal');
  return 0;
}
