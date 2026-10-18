// gamekit status / next — where a game stands and what to do next.
import fs from 'node:fs';
import path from 'node:path';
import { exists } from './lib/io.mjs';
import { log } from './lib/log.mjs';
import { findGameRoot, loadGame, ownershipOf, OWNERSHIP_LABEL } from './lib/game.mjs';
import { PHASES, AVAILABLE_SKILLS, phaseInfo } from './lib/phases.mjs';
import { loadPortal, missingSettings } from './lib/portals.mjs';
import { gateItemsFor } from './gate.mjs';
import { planState } from './parallel.mjs';

const days = (a, b = new Date()) => (b - new Date(a)) / 864e5;

export function summarize(root) {
  const game = loadGame(root);
  const phase = game.phase;
  const lines = [];
  const ownership = ownershipOf(game);
  lines.push(`Game: ${game.title} (${game.name}) v${game.version} — engine gốc: ${game.source?.engine ?? '?'} — ${OWNERSHIP_LABEL[ownership] ?? ownership}`);
  if (phase === 'released') {
    lines.push('Pha: đã phát hành');
    return { game, lines, pending: [], skills: [] };
  }
  const info = phaseInfo(phase, ownership);
  lines.push(`Pha: ${phase} ${info.name}`);
  const start = game.timings?.[phase]?.start;
  const planned = game.budget?.plannedDays?.[phase];
  if (start) {
    const d = days(start);
    lines.push(`Đã ở pha này ${d.toFixed(1)} ngày${planned ? ` / dự kiến ${planned}` : ''}`);
    if (planned && d > planned) lines.push(`⚠ Vượt thời gian dự kiến — cân nhắc quay lại triage (luật cắt lỗ).`);
  }
  const gateFile = path.join(root, 'gates', `${phase}.md`);
  const pending = exists(gateFile) ? gateItemsFor(game, fs.readFileSync(gateFile, 'utf8'), root).filter((i) => !i.auto && !i.checked) : [];
  const skills = info.skills.map((s) => s.replace('<engine>', game.source?.engine ?? 'unknown'));
  const missing = [];
  for (const p of game.portals ?? []) {
    try {
      const miss = missingSettings(loadPortal(p), game.portalSettings?.[p]);
      if (miss.length) missing.push(`${p}: ${miss.join(', ')}`);
    } catch (e) {
      missing.push(`${p}: ${e.message}`);
    }
  }
  const parallel = ['re', 'build'].map((k) => planState(root, game, k)).filter(Boolean);
  return { game, lines, pending, skills, human: info.human, missing, parallel };
}

const UNIT = { re: 'mảng phân tích', build: 'module' };

/** Parallel work of one plan: what to hand out now, what to integrate, what runs, what waits. */
function printParallel(p) {
  if (p.invalid) {
    log.info(`\nViệc song song (${p.file}): kế hoạch không hợp lệ — \`gamekit validate\``);
    return;
  }
  const by = (st) => p.rows.filter((r) => r.state === st);
  const merged = by('merged');
  if (merged.length === p.rows.length) {
    log.dim(`\nViệc song song (${p.file}): mọi ${UNIT[p.kind]} đã merge (${merged.length})`);
    return;
  }
  const plan = p.kind === 're' ? ' --plan re' : '';
  log.info(`\nViệc song song (${p.file}, tối đa ${p.maxParallel} cùng lúc) — ${merged.length}/${p.rows.length} ${UNIT[p.kind]} đã merge:`);
  const done = by('done');
  if (done.length) log.info(`  Xong, chờ integrate: ${done.map((r) => `${r.id} (${r.commits} commit)`).join(', ')} → \`gamekit integrate${plan} --ready\``);
  const running = by('running');
  if (running.length) log.info(`  Đang làm: ${running.map((r) => r.id).join(', ')}`);
  const ready = by('ready').filter((r) => !r.capped);
  if (ready.length) log.info(`  Sẵn sàng, giao được ngay: ${ready.map((r) => r.id).join(', ')} → \`gamekit fanout${plan} --ready\`, rồi mỗi worktree một subagent, giao cùng một lượt`);
  const capped = by('ready').filter((r) => r.capped);
  if (capped.length) log.info(`  Sẵn sàng nhưng đã đủ ${p.maxParallel} việc đang chạy: ${capped.map((r) => r.id).join(', ')}`);
  const blocked = by('blocked');
  if (blocked.length) log.info(`  Chờ phụ thuộc: ${blocked.map((r) => `${r.id} (chờ ${r.waits.join(', ')})`).join(', ')}`);
}

function print(root) {
  const s = summarize(root);
  for (const l of s.lines) log.info(l);
  if (s.game.phase === 'released') return 0;
  const done = PHASES.filter((p) => s.game.gates?.[p]?.passed);
  if (done.length) log.dim(`Cổng đã qua: ${done.join(', ')}`);
  if (s.pending.length) {
    log.info('\nViệc còn mở ở cổng:');
    for (const p of s.pending) log.info(`  - ${p.text}${p.human ? '  ← bạn quyết' : ''}`);
  }
  for (const p of s.parallel ?? []) printParallel(p);
  if (s.missing?.length) {
    log.info('\nThông tin portal còn thiếu (cần trước khi pack) — `gamekit config --portal <id>`:');
    for (const m of s.missing) log.info(`  - ${m}`);
  }
  {
    log.info('\nSkill cho pha này (theo thứ tự):');
    for (const sk of s.skills) {
      const avail = AVAILABLE_SKILLS.has(sk) ? '' : '  (chưa có trong bản này — làm theo hướng dẫn chung)';
      log.info(`  - ${sk}${avail}`);
    }
    if (s.human) log.info(`\nĐiểm bạn quyết ở pha này: ${s.human}`);
    log.info('\nKhi xong: `gamekit gate` để kiểm tra cổng, `gamekit gate --advance` để sang pha sau.');
  }
  return 0;
}

export async function run(args) {
  const root = findGameRoot(args.cwd);
  if (!root) {
    log.info('Thư mục này chưa có game.yaml. Tạo game mới: `gamekit init <tên> --title "<Tên>" --engine <engine>`.');
    return 0;
  }
  return print(root);
}
