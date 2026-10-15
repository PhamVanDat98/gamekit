// gamekit release-check — last gate before a package leaves: provenance clean, no foreign links, no original names, within budget.
import fs from 'node:fs';
import path from 'node:path';
import { exists, walk } from './lib/io.mjs';
import { Problems, log } from './lib/log.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { PHASES } from './lib/phases.mjs';
import { validateGame, loadProvenance } from './validate.mjs';

const ALWAYS_ALLOWED_HOSTS = ['www.w3.org', 'w3.org'];
const TEXT = /\.(html|js|mjs|css|json|svg|txt|xml)$/i;
const SHIP_OK = new Set(['own', 'generated', 'licensed']);

const hostAllowed = (host, allowed) => allowed.some((a) => host === a || host.endsWith('.' + a));

export function checkPackage(root, portal, game, prov) {
  const pr = new Problems();
  const dir = path.join(root, 'dist', portal);
  const where = `dist/${portal}`;
  if (!exists(path.join(dir, 'index.html'))) {
    pr.error(where, 'chưa có bản build — chạy `gamekit pack`');
    return pr;
  }
  const files = walk(dir);
  const labels = new Map((prov.entries ?? []).map((e) => [e.path, e.label]));
  const terms = (game.release?.forbiddenTerms ?? []).filter(Boolean).map((t) => t.toLowerCase());
  const allowed = [...ALWAYS_ALLOWED_HOSTS, ...(game.release?.allowedHosts ?? [])];
  let initialBytes = 0;

  for (const rel of files) {
    const abs = path.join(dir, rel);
    const top = rel.split('/')[0];
    if (/\.(gz|br)$/.test(rel)) continue;
    if (/(^|\/)(reference|decompiled)(\/|$)/.test(rel)) pr.error(where, `${rel}: thư mục cấm nằm trong gói`);
    if (rel.endsWith('.map')) pr.warn(where, `${rel}: source map lộ mã nguồn — tắt build.sourcemap khi phát hành`);
    if (rel === 'index.html' || top === 'Build' || top === 'TemplateData') initialBytes += fs.statSync(abs).size;

    // Files copied from public/ keep their path; they must carry a shippable label.
    if ((top === 'StreamingAssets' || top === 'TemplateData') && rel !== 'StreamingAssets/build-manifest.json' && !rel.endsWith('.gitkeep')) {
      const label = labels.get(`public/${rel}`);
      if (!label) pr.error(where, `${rel}: không có nhãn provenance (public/${rel})`);
      else if (!SHIP_OK.has(label)) pr.error(where, `${rel}: nhãn ${label} không được phát hành`);
    }

    if (TEXT.test(rel)) {
      const text = fs.readFileSync(abs, 'utf8');
      const lower = text.toLowerCase();
      for (const t of terms) if (lower.includes(t)) pr.error(where, `${rel}: còn tên/thương hiệu game gốc "${t}"`);
      for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
        if (!hostAllowed(m[1].toLowerCase(), allowed)) pr.error(where, `${rel}: link ngoài tới ${m[1]} (thêm vào release.allowedHosts nếu là SDK portal)`);
      }
      if (rel === 'index.html') {
        for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["'](\/[^"']*)["']/gi)) pr.error(where, `index.html: đường dẫn tuyệt đối ${m[1]} — phải là đường dẫn tương đối`);
      }
    }
  }
  const mb = initialBytes / 1024 / 1024;
  const budget = game.budget?.initialLoadMB;
  if (budget && mb > budget) pr.error(where, `tải đầu ${mb.toFixed(2)}MB vượt ngân sách ${budget}MB`);
  else log.dim(`${where}: tải đầu ${mb.toFixed(2)}MB${budget ? ` / ${budget}MB` : ''}`);
  return pr;
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const { problems, game } = validateGame(root, { stage: PHASES.indexOf('P5') });
  const all = new Problems().merge(problems);
  const prov = loadProvenance(root);
  const portals = args.portal ? String(args.portal).split(',') : game.portals ?? [];
  for (const p of portals) all.merge(checkPackage(root, p, game, prov));
  return all.report('release-check') ? 0 : 1;
}
