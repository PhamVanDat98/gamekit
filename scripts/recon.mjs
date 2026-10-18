// gamekit recon [path] [--write] [--json] — what the original game is made of, how hard its logic
// is to reach, and a first feasibility estimate. --write records it in the game: notes/recon.md,
// game.yaml (engine, version, variant, path, planned days) and spec/inventory.yaml.
import fs from 'node:fs';
import path from 'node:path';
import { log, GkError } from './lib/log.mjs';
import { findGameRoot, loadGame, ownershipOf, updateGame, nowIso } from './lib/game.mjs';
import { PHYSICS_LABEL, recon } from './lib/recon.mjs';
import { triage } from './lib/triage.mjs';
import { INVENTORY_FILE, loadInventory, mergeInventory, writeInventory } from './lib/inventory.mjs';
import { ENGINES } from './lib/questions.mjs';
import { PHASES } from './lib/phases.mjs';
import { appendEntry, compact, readFocus } from './lib/relog.mjs';

const RECON_FILE = 'notes/recon.md';
const KEEP_HEADING = '## Ghi chú thêm';
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

function kinds(items) {
  const c = {};
  for (const i of items) c[i.kind] = (c[i.kind] ?? 0) + 1;
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${k}`)
    .join(', ');
}

/** Report as [kind, text] lines (same text for the terminal and notes/recon.md). */
function lines(r, tri) {
  const out = [];
  const where = { dir: 'thư mục', archive: 'gói', file: 'file' }[r.kind];
  out.push(['head', `Recon: ${r.target} (${where}) — ${r.files} file, ${mb(r.bytes)}`]);
  if (r.inventoryOnly) {
    out.push(['info', `Danh mục cơ chế từ ${r.inventory.source}: ${r.inventory.items.length} type (${kinds(r.inventory.items) || 'không có'})`]);
    if (r.physics) out.push(['info', `Không gian, vật lý: ${r.physics.dimension.toUpperCase()}, ${PHYSICS_LABEL[r.physics.physics]} (${r.physics.signals.slice(0, 6).join(', ')})`]);
    return out;
  }
  out.push(['info', `Engine: ${r.engine}${r.engineVersion ? ` ${r.engineVersion}` : ''}${r.variant ? ` · ${r.variant}` : ''}${r.platform ? ` · ${r.platform}` : ''}${r.hasSource ? ' · có source' : ''}`]);
  if (r.logic.length) out.push(['info', `Logic: ${r.logic.join(', ')}`]);
  if (r.data.length) out.push(['info', `Data: ${r.data.join(', ')}`]);
  if (r.inventory) out.push(['info', `Danh mục cơ chế: ${r.inventory.items.length} type (${kinds(r.inventory.items) || 'không có'}) — từ ${r.inventory.source}`]);
  if (r.sdks.length) {
    out.push(['info', 'SDK:']);
    for (const s of r.sdks) out.push(['info', `  ${s.cat === 'server' ? '⚠ ' : ''}${s.label}: ${s.names.join(', ')}`]);
  }
  for (const s of r.signals) out.push([s.level === 'risk' ? 'warn' : 'ok', s.text]);
  if (r.unknowns.length) out.push(['info', `Chưa biết: ${r.unknowns.join('; ')}`]);
  out.push(['info', `Công cụ gợi ý: ${r.tools.join(' · ')}`]);
  if (tri) {
    out.push(['head', `\nĐánh giá khả thi (ước lượng thô): điểm ${tri.score} → ${tri.verdict.text}`]);
    for (const f of tri.factors) out.push(['info', `  ${f.name}: ×${f.value} — ${f.note}`]);
    out.push(['info', `  Số ngày dự kiến: ${PHASES.map((p) => `${p} ${tri.plannedDays[p]}`).join(' · ')}`]);
  }
  return out;
}

function reconMarkdown(r, tri, keep) {
  const body = lines(r, tri)
    .slice(1)
    .map(([kind, text]) => {
      if (kind === 'head') return `\n## ${text.trim()}\n`;
      const indent = /^ {2}/.test(text) ? '  ' : '';
      return `${indent}- ${kind === 'warn' ? '⚠ ' : ''}${text.trim()}`;
    })
    .join('\n');
  return `# Recon — ${path.basename(r.target)}

_Sinh bởi \`gamekit recon\` lúc ${nowIso()} từ \`${r.target}\` (${r.files} file, ${mb(r.bytes)}). Chạy lại sẽ ghi đè mọi thứ trên mục "${KEEP_HEADING.slice(3)}"._
${body}

${KEEP_HEADING}
${keep ?? '\nKiểm chứng lại kết quả trên (engine, phiên bản, SDK) và ghi điều recon không thấy được ở đây.\n'}`;
}

function write(root, r, tri, givenPath) {
  const done = [];
  if (!r.inventoryOnly) {
    const f = path.join(root, RECON_FILE);
    const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    const keep = old.includes(KEEP_HEADING) ? old.slice(old.indexOf(KEEP_HEADING) + KEEP_HEADING.length) : null;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, reconMarkdown(r, tri, keep));
    done.push(RECON_FILE);

    const game = loadGame(root);
    const edits = [];
    const cur = game.source?.engine ?? 'unknown';
    if (ENGINES.includes(r.engine) && r.engine !== 'unknown') {
      if (cur === 'unknown' || cur === 'other') edits.push([['source', 'engine'], r.engine]);
      else if (cur !== r.engine) log.warn(`game.yaml ghi engine "${cur}" nhưng recon thấy "${r.engine}" — giữ nguyên; sửa tay nếu recon đúng`);
    }
    if (r.engineVersion && r.engineVersion !== game.source?.engineVersion) edits.push([['source', 'engineVersion'], r.engineVersion]);
    if (r.variant && r.variant !== game.source?.variant) edits.push([['source', 'variant'], r.variant]);
    if (r.physics && r.physics.dimension !== game.source?.dimension) edits.push([['source', 'dimension'], r.physics.dimension]);
    if (r.physics && r.physics.physics !== game.source?.physics) edits.push([['source', 'physics'], r.physics.physics]);
    if (!game.source?.path && givenPath) edits.push([['source', 'path'], givenPath]);
    const planned = game.budget?.plannedDays ?? {};
    for (const p of PHASES) if (planned[p] == null) edits.push([['budget', 'plannedDays', p], tri.plannedDays[p]]);
    if (edits.length) {
      updateGame(root, edits);
      done.push(`game.yaml (${[...new Set(edits.map(([k]) => k.slice(0, 2).join('.')))].join(', ')})`);
    }
  }
  if (r.inventoryOnly && r.physics) {
    const game = loadGame(root);
    const edits = [];
    if (r.physics.dimension !== game.source?.dimension) edits.push([['source', 'dimension'], r.physics.dimension]);
    if (r.physics.physics !== game.source?.physics) edits.push([['source', 'physics'], r.physics.physics]);
    if (edits.length) {
      updateGame(root, edits);
      done.push('game.yaml (source.dimension, source.physics)');
    }
  }
  // recon is an analysis step too: it shows up in `gamekit re` like any other tool.
  appendEntry(root, compact({ at: nowIso(), phase: loadGame(root).phase, q: readFocus(root)?.q, kind: 'inspect', via: 'gamekit', tool: 'recon', target: `${path.basename(r.target)}${r.inventoryOnly ? ' (danh mục cơ chế)' : ` → ${r.engine}${r.variant ? ` ${r.variant}` : ''}`}` }));
  if (r.inventory) {
    const { data, added, missing } = mergeInventory(loadInventory(root), r.inventory);
    writeInventory(root, data);
    done.push(`${INVENTORY_FILE} (+${added} mục mới${missing ? `, ${missing} mục không còn thấy` : ''})`);
  }
  return done;
}

export async function run(args) {
  const root = findGameRoot(args.cwd);
  let target = args._[0];
  let givenPath = null;
  if (!target) {
    const p = root && loadGame(root).source?.path;
    if (!p) throw new GkError('Dùng: gamekit recon <đường dẫn game gốc | APK | Assembly-CSharp.dll | dump.cs> [--write] [--json]');
    target = path.resolve(root, p);
  } else {
    target = path.resolve(args.cwd ?? process.cwd(), String(target));
    givenPath = root ? path.relative(root, target) || '.' : target;
  }
  let r;
  try {
    r = recon(target);
  } catch (e) {
    throw new GkError(`Không đọc được ${target}: ${e.message}`);
  }
  const ownership = root ? ownershipOf(loadGame(root)) : 'own';
  // IL2CPP builds hide it; a dump.cs/DummyDll recon may have recorded it in game.yaml already.
  const known = root && loadGame(root).source;
  if (!r.physics && !r.inventoryOnly && known?.dimension) {
    r.physics = { dimension: known.dimension, physics: known.physics ?? 'none', signals: ['game.yaml'], mixed: false, fromGame: true };
    r.unknowns = r.unknowns.filter((u) => !u.startsWith('2D hay 3D'));
  }
  const tri = r.inventoryOnly ? null : triage(r, { ownership });
  if (args.json) {
    log.info(JSON.stringify({ ...r, triage: tri }, null, 2));
  } else for (const [kind, text] of lines(r, tri)) log[kind](text);
  if (args.write) {
    if (!root) throw new GkError('--write cần chạy trong thư mục game (có game.yaml)');
    const done = write(root, r, tri, givenPath);
    if (!args.json) log.ok(`Đã ghi: ${done.join(' · ')}`);
  } else if (!args.json) log.dim(`\n${root ? 'Chạy lại với --write để ghi vào notes/recon.md, game.yaml và spec/inventory.yaml.' : 'Trong thư mục game, thêm --write để ghi kết quả vào game.'}`);
  return 0;
}
