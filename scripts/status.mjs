// gamekit status / next — where a game stands and what to do next.
import fs from 'node:fs';
import path from 'node:path';
import { exists } from './lib/io.mjs';
import { log } from './lib/log.mjs';
import { findGameRoot, loadGame } from './lib/game.mjs';
import { PHASES, PHASE_INFO, AVAILABLE_SKILLS } from './lib/phases.mjs';
import { parseGate } from './gate.mjs';

const days = (a, b = new Date()) => (b - new Date(a)) / 864e5;

export function summarize(root) {
  const game = loadGame(root);
  const phase = game.phase;
  const lines = [];
  lines.push(`Game: ${game.title} (${game.name}) v${game.version} — engine gốc: ${game.source?.engine ?? '?'}`);
  if (phase === 'released') {
    lines.push('Pha: đã phát hành');
    return { game, lines, pending: [], skills: [] };
  }
  const info = PHASE_INFO[phase];
  lines.push(`Pha: ${phase} ${info.name}`);
  const start = game.timings?.[phase]?.start;
  const planned = game.budget?.plannedDays?.[phase];
  if (start) {
    const d = days(start);
    lines.push(`Đã ở pha này ${d.toFixed(1)} ngày${planned ? ` / dự kiến ${planned}` : ''}`);
    if (planned && d > planned) lines.push(`⚠ Vượt thời gian dự kiến — cân nhắc quay lại triage (luật cắt lỗ).`);
  }
  const gateFile = path.join(root, 'gates', `${phase}.md`);
  const pending = exists(gateFile) ? parseGate(fs.readFileSync(gateFile, 'utf8')).filter((i) => !i.auto && !i.checked) : [];
  const skills = info.skills.map((s) => s.replace('<engine>', game.source?.engine ?? 'unknown'));
  return { game, lines, pending, skills, human: info.human };
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
